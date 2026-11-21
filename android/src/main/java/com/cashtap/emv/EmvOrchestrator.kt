package com.cashtap.emv

/** Etapas do diálogo medidas separadamente (TCC §3.6, Apêndice B). */
enum class EmvStep {
  SELECT_PPSE,
  SELECT_AID,
  GET_PROCESSING_OPTIONS,
  READ_RECORD,
}

/** Uma troca comando/resposta, já mascarada, para o modo de diagnóstico (E7-H3). */
data class ApduExchange(
  val step: EmvStep,
  val command: String,
  val response: String,
  val sw: String,
  val durationMs: Double,
)

fun interface DiagnosticSink {
  fun onExchange(exchange: ApduExchange)
}

/** Resultado de uma leitura bem-sucedida. `pan` em claro só aqui (RN-24). */
data class CardReadResult(
  val pan: String,
  val panMasked: String,
  val expiry: String,
  val brand: CardBrand,
  val aid: String,
  val applicationLabel: String?,
  val panSequenceNumber: String?,
  val cryptogramPresent: Boolean,
  val stepDurationsMs: Map<EmvStep, Double>,
) {
  /** Nunca imprime o PAN (RN-23). */
  override fun toString() = "CardReadResult(pan=$panMasked, brand=$brand, aid=$aid)"
}

/**
 * Conduz o diálogo EMV com o cartão no campo:
 * SELECT PPSE → SELECT AID → GET PROCESSING OPTIONS → READ RECORD (RN-12..RN-21).
 *
 * Operação sem memória de fluxo: timeout, retentativa e mensagens ficam na máquina
 * de estados do TS (especificação §2.3). A unidade atômica é cada APDU: o
 * cancelamento é verificado antes de cada comando, nunca no meio de uma troca (RN-10, D017).
 */
class EmvOrchestrator(
  private val transceiver: Transceiver,
  terminal: TerminalData,
  private val clock: Clock = Clock.System,
  private val logger: Logger = Logger.None,
  private val diagnostics: DiagnosticSink? = null,
  private val isCancelled: () -> Boolean = { false },
  pdolBuilder: PdolBuilder? = null,
) {
  private val pdolBuilder = pdolBuilder ?: PdolBuilder(terminal, clock)
  private val durations = linkedMapOf<EmvStep, Double>()

  /** RN-26: todo buffer e TLV com bytes do cartão, sobrescritos ao final da leitura. */
  private val rawBuffers = mutableListOf<ByteArray>()
  private val parsedTlvs = mutableListOf<Tlv>()

  private class Candidate(val aid: ByteArray, val label: String?, val priority: Int)

  private class SelectedApplication(
    val aid: ByteArray,
    val brand: CardBrand,
    val label: String?,
    val pdol: ByteArray?,
  )

  /** Só para testes: recebe tudo que foi zerado, antes de as listas serem descartadas (RN-26). */
  internal var wipeObserver: ((buffers: List<ByteArray>, tlvs: List<Tlv>) -> Unit)? = null

  fun read(): CardReadResult {
    durations.clear()
    try {
      val (application, gpoTlvs) = selectAndInitiate()
      val allTlvs = gpoTlvs + readRecords(gpoTlvs)

      val card = CardDataExtractor.extract(allTlvs)
      return CardReadResult(
        pan = card.pan,
        panMasked = Masking.maskPan(card.pan),
        expiry = card.expiry,
        brand = application.brand,
        aid = application.aid.toHex(),
        applicationLabel = application.label,
        panSequenceNumber = card.panSequenceNumber,
        cryptogramPresent = allTlvs.find(EmvTags.APPLICATION_CRYPTOGRAM) != null,
        stepDurationsMs = EmvStep.values().associateWith { durations[it] ?: 0.0 },
      )
    } finally {
      // RN-26: strings JVM são imutáveis; os bytes, não.
      rawBuffers.forEach { it.fill(0) }
      parsedTlvs.forEach(Tlv::wipe)
      wipeObserver?.invoke(rawBuffers.toList(), parsedTlvs.toList())
      rawBuffers.clear()
      parsedTlvs.clear()
    }
  }

  // ---- Etapas 1 a 3: diretório, seleção e GET PROCESSING OPTIONS ----

  /**
   * Seleciona a aplicação e inicia a transação. Se o GPO responder 6984/6985/6986
   * ("condições não satisfeitas"), a aplicação é descartada e a próxima candidata é
   * tentada, como no Entry Point do EMV Book B.
   */
  private fun selectAndInitiate(): Pair<SelectedApplication, List<Tlv>> {
    var lastGpoSw: String? = null
    for (candidate in candidates()) {
      val application = select(candidate) ?: continue
      val response = getProcessingOptions(application.pdol)
      if (response.sw in GPO_TRY_NEXT_APPLICATION) {
        logger.debug("GPO ${response.swHex}: tentando a próxima aplicação")
        lastGpoSw = response.swHex
        continue
      }
      if (!response.isSuccess) {
        throw EmvException(EmvError.PROTOCOL_ERROR, "GPO respondeu ${response.swHex}")
      }
      return application to parseGpo(response.data)
    }
    if (lastGpoSw != null) {
      throw EmvException(EmvError.PROTOCOL_ERROR, "GPO recusado por todas as aplicações ($lastGpoSw)")
    }
    throw EmvException(EmvError.UNSUPPORTED_BRAND, "nenhuma aplicação suportada aceitou o SELECT")
  }

  private fun candidates(): List<Candidate> {
    val ppse = exchange(EmvStep.SELECT_PPSE, Commands.selectByName(Commands.PPSE_NAME))
    return when {
      ppse.sw == ResponseApdu.SW_FILE_NOT_FOUND -> {
        logger.debug("PPSE ausente (6A82): SELECT AID direto com AIDs conhecidos (RN-15)")
        AidRegistry.FALLBACK_AIDS.map { Candidate(it, null, Int.MAX_VALUE) }
      }
      // Cartão ISO-DEP que não fala SELECT por nome: crachá, transporte etc.
      ppse.sw in NOT_A_PAYMENT_CARD ->
        throw EmvException(EmvError.UNSUPPORTED_BRAND, "PPSE respondeu ${ppse.swHex}")
      !ppse.isSuccess -> throw EmvException(EmvError.PROTOCOL_ERROR, "SELECT PPSE respondeu ${ppse.swHex}")
      else -> supportedCandidatesFromPpse(ppse.data)
    }
  }

  /**
   * RN-13: só AIDs do registro. Entre eles vale o indicador de prioridade (87, nibble
   * baixo; 1 = maior; ausente = menor) e, no empate, a ordem do diretório (D014).
   */
  private fun supportedCandidatesFromPpse(data: ByteArray): List<Candidate> {
    val entries = parse(data).findAll(EmvTags.DIRECTORY_ENTRY).mapNotNull { entry ->
      val aid = entry.find(EmvTags.AID)?.value?.copyOf() ?: return@mapNotNull null
      val priority = entry.find(EmvTags.PRIORITY_INDICATOR)?.value?.firstOrNull()
        ?.let { (it.toInt() and 0x0F).takeIf { p -> p != 0 } } ?: Int.MAX_VALUE
      Candidate(aid, entry.find(EmvTags.APPLICATION_LABEL)?.value?.let(::ascii), priority)
    }
    if (entries.isEmpty()) {
      throw EmvException(EmvError.PARSE_ERROR, "PPSE sem entradas de diretório (61)")
    }
    val supported = entries.filter { AidRegistry.brandOf(it.aid) != null }.sortedBy { it.priority }
    if (supported.isEmpty()) {
      throw EmvException(
        EmvError.UNSUPPORTED_BRAND,
        "AIDs no cartão: ${entries.joinToString { it.aid.toHex() }}",
      )
    }
    return supported
  }

  private fun select(candidate: Candidate): SelectedApplication? {
    val response = exchange(EmvStep.SELECT_AID, Commands.selectByName(candidate.aid))
    if (!response.isSuccess) {
      logger.debug("SELECT AID ${candidate.aid.toHex()} respondeu ${response.swHex}")
      return null
    }
    val fci = parse(response.data)
    // Seleção parcial: o FCI informa o AID completo em 84.
    val aid = fci.find(EmvTags.DF_NAME)?.value?.takeIf { AidRegistry.brandOf(it) != null }?.copyOf()
      ?: candidate.aid
    val label = fci.find(EmvTags.APPLICATION_LABEL)?.value?.let(::ascii) ?: candidate.label
    // Candidatas vêm sempre do registro (PPSE filtrado ou fallback): a bandeira existe (RN-20).
    val brand = AidRegistry.brandOf(aid)
      ?: throw EmvException(EmvError.UNSUPPORTED_BRAND, "AID fora do registro")
    return SelectedApplication(aid, brand, label, fci.find(EmvTags.PDOL)?.value?.copyOf())
  }

  private fun getProcessingOptions(pdol: ByteArray?): ResponseApdu {
    val pdolData = pdol?.let { pdolBuilder.build(TlvParser.parseDol(it)) } ?: ByteArray(0)
    if (pdolData.size > Commands.MAX_PDOL_DATA) {
      throw EmvException(EmvError.PARSE_ERROR, "PDOL pede ${pdolData.size} bytes; máximo ${Commands.MAX_PDOL_DATA}")
    }
    return exchange(EmvStep.GET_PROCESSING_OPTIONS, Commands.getProcessingOptions(pdolData))
  }

  private fun parseGpo(data: ByteArray): List<Tlv> {
    val root = parse(data).firstOrNull()
      ?: throw EmvException(EmvError.PARSE_ERROR, "GPO sem dados")
    return when (root.tag) {
      // Formato 1: AIP (2 bytes) seguido do AFL, sem tags internas.
      EmvTags.RESPONSE_FORMAT_1 -> {
        if (root.value.size < 2) throw EmvException(EmvError.PARSE_ERROR, "GPO formato 1 sem AIP")
        listOf(
          syntheticTlv(EmvTags.AIP, root.value.copyOfRange(0, 2)),
          syntheticTlv(EmvTags.AFL, root.value.copyOfRange(2, root.value.size)),
        ).also(parsedTlvs::addAll)
      }
      // Formato 2: template 77 com AIP, AFL e, em qVSDC, já o Track 2 e o criptograma.
      EmvTags.RESPONSE_FORMAT_2 -> root.children
      else -> throw EmvException(EmvError.PARSE_ERROR, "GPO com template inesperado")
    }
  }

  // ---- Etapa 4: READ RECORD ----

  private fun readRecords(gpoTlvs: List<Tlv>): List<Tlv> {
    val afl = gpoTlvs.find(EmvTags.AFL)?.value?.takeIf { it.isNotEmpty() } ?: return emptyList()
    val records = mutableListOf<Tlv>()
    for (location in Afl.records(Afl.parse(afl))) {
      val response = exchange(EmvStep.READ_RECORD, Commands.readRecord(location.sfi, location.record))
      if (!response.isSuccess) {
        // E3-H5: falha num registro individual não aborta; RN-21 decide no fim.
        logger.warn("READ RECORD SFI ${location.sfi} registro ${location.record} respondeu ${response.swHex}")
        continue
      }
      try {
        records += parse(response.data)
      } catch (e: EmvException) {
        logger.warn("registro SFI ${location.sfi}/${location.record} ignorado: ${e.detail}")
      }
    }
    return records
  }

  // ---- Troca de APDU ----

  private fun exchange(step: EmvStep, command: CommandApdu): ResponseApdu {
    if (isCancelled()) throw EmvException(EmvError.CANCELLED_BY_USER, "cancelado antes de ${step.name}")

    val start = clock.monotonicNanos()
    var response = transmit(command)
    var sent = command
    // ISO 7816-4: 6Cxx pede reenvio com Le = xx; 61xx indica bytes a buscar com GET RESPONSE.
    if (response.sw1 == ResponseApdu.SW1_WRONG_LE) {
      sent = command.withLe(response.sw2)
      response = transmit(sent)
    }
    if (response.sw1 == ResponseApdu.SW1_BYTES_AVAILABLE) {
      var data = response.data
      var guard = 0
      while (response.sw1 == ResponseApdu.SW1_BYTES_AVAILABLE && guard++ < MAX_GET_RESPONSE) {
        response = transmit(Commands.getResponse(response.sw2))
        data = (data + response.data).also(rawBuffers::add)
      }
      val assembled = (data + byteArrayOf(response.sw1.toByte(), response.sw2.toByte())).also(rawBuffers::add)
      response = ResponseApdu(assembled).also { rawBuffers += it.data }
    }
    val durationMs = (clock.monotonicNanos() - start) / 1_000_000.0
    durations[step] = (durations[step] ?: 0.0) + durationMs

    diagnostics?.onExchange(
      ApduExchange(
        step = step,
        command = sent.toBytes().toHex(),
        response = Masking.maskResponseData(response.data),
        sw = response.swHex,
        durationMs = durationMs,
      )
    )
    logger.debug("${step.name} → ${response.swHex} em ${"%.1f".format(durationMs)} ms")
    return response
  }

  private fun transmit(command: CommandApdu): ResponseApdu {
    val raw = try {
      transceiver.transceive(command.toBytes())
    } catch (e: LinkLostException) {
      throw EmvException(EmvError.CARD_REMOVED, "cartão saiu do campo", e)
    }
    rawBuffers += raw
    return ResponseApdu(raw).also { rawBuffers += it.data }
  }

  private fun parse(data: ByteArray): List<Tlv> = TlvParser.parse(data).also(parsedTlvs::addAll)

  private fun syntheticTlv(tag: Int, value: ByteArray) =
    Tlv(tag, byteArrayOf(tag.toByte(), value.size.toByte()), value, emptyList())

  private fun ascii(bytes: ByteArray) = String(bytes, Charsets.US_ASCII).trim()

  companion object {
    private const val MAX_GET_RESPONSE = 16

    /** "Condições de uso não satisfeitas": tentar a próxima aplicação (Book B). */
    private val GPO_TRY_NEXT_APPLICATION = setOf(0x6984, 0x6985, 0x6986)

    /** INS/CLA não suportados ou função não suportada no SELECT do PPSE. */
    private val NOT_A_PAYMENT_CARD = setOf(0x6D00, 0x6E00, 0x6A81)
  }
}
