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
)

/**
 * Conduz o diálogo EMV com o cartão no campo:
 * SELECT PPSE → SELECT AID → GET PROCESSING OPTIONS → READ RECORD (RN-12..RN-21).
 *
 * Operação atômica e sem memória de fluxo: timeout, retentativa e mensagens
 * ficam na máquina de estados do TS (especificação §2.3). O cancelamento é
 * verificado entre comandos, para nunca interromper uma troca no meio (RN-10).
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
  private val sensitiveBuffers = mutableListOf<ByteArray>()

  private class Candidate(val aid: ByteArray, val label: String?, val priority: Int)

  private class SelectedApplication(val aid: ByteArray, val label: String?, val pdol: ByteArray?)

  fun read(): CardReadResult {
    durations.clear()
    try {
      val application = selectApplication()
      val brand = AidRegistry.brandOf(application.aid)
        ?: throw EmvException(EmvError.UNSUPPORTED_BRAND, "AID ${application.aid.toHex()} fora do registro")

      val gpoTlvs = getProcessingOptions(application.pdol)
      val recordTlvs = readRecords(gpoTlvs)
      val allTlvs = gpoTlvs + recordTlvs

      val card = CardDataExtractor.extract(allTlvs)
      return CardReadResult(
        pan = card.pan,
        panMasked = Masking.maskPan(card.pan),
        expiry = card.expiry,
        brand = brand,
        aid = application.aid.toHex(),
        applicationLabel = application.label,
        panSequenceNumber = card.panSequenceNumber,
        cryptogramPresent = allTlvs.find(EmvTags.APPLICATION_CRYPTOGRAM) != null,
        stepDurationsMs = EmvStep.values().associateWith { durations[it] ?: 0.0 },
      )
    } finally {
      // RN-26: sobrescreve as respostas brutas que continham dados do cartão.
      sensitiveBuffers.forEach { it.fill(0) }
      sensitiveBuffers.clear()
    }
  }

  // ---- Etapas 1 e 2: PPSE e seleção da aplicação ----

  private fun selectApplication(): SelectedApplication {
    val ppse = exchange(EmvStep.SELECT_PPSE, Commands.selectByName(Commands.PPSE_NAME))

    val candidates = when {
      ppse.sw == ResponseApdu.SW_FILE_NOT_FOUND -> {
        logger.debug("PPSE ausente (6A82): SELECT AID direto com AIDs conhecidos (RN-15)")
        AidRegistry.FALLBACK_AIDS.map { Candidate(it, null, Int.MAX_VALUE) }
      }
      !ppse.isSuccess -> throw EmvException(EmvError.PROTOCOL_ERROR, "SELECT PPSE respondeu ${ppse.swHex}")
      else -> supportedCandidatesFromPpse(ppse.data)
    }

    for (candidate in candidates) {
      val response = exchange(EmvStep.SELECT_AID, Commands.selectByName(candidate.aid))
      if (!response.isSuccess) {
        logger.debug("SELECT AID ${candidate.aid.toHex()} respondeu ${response.swHex}")
        continue
      }
      val fci = TlvParser.parse(response.data)
      val aid = fci.find(EmvTags.DF_NAME)?.value?.takeIf { AidRegistry.brandOf(it) != null } ?: candidate.aid
      val label = fci.find(EmvTags.APPLICATION_LABEL)?.value?.let(::ascii) ?: candidate.label
      return SelectedApplication(aid, label, fci.find(EmvTags.PDOL)?.value)
    }
    throw EmvException(EmvError.UNSUPPORTED_BRAND, "nenhuma aplicação suportada aceitou o SELECT")
  }

  /**
   * RN-13: só AIDs do registro. Entre eles, vale o indicador de prioridade (87, nibble
   * baixo; 1 = maior prioridade; ausente = menor) e, no empate, a ordem do diretório.
   */
  private fun supportedCandidatesFromPpse(data: ByteArray): List<Candidate> {
    val entries = TlvParser.parse(data).findAll(EmvTags.DIRECTORY_ENTRY).mapNotNull { entry ->
      val aid = entry.find(EmvTags.AID)?.value ?: return@mapNotNull null
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

  // ---- Etapa 3: GET PROCESSING OPTIONS ----

  private fun getProcessingOptions(pdol: ByteArray?): List<Tlv> {
    val pdolData = pdol?.let { pdolBuilder.build(TlvParser.parseDol(it)) } ?: ByteArray(0)
    val response = exchange(EmvStep.GET_PROCESSING_OPTIONS, Commands.getProcessingOptions(pdolData))
    if (!response.isSuccess) {
      throw EmvException(EmvError.PROTOCOL_ERROR, "GPO respondeu ${response.swHex}")
    }
    sensitiveBuffers += response.data
    val tlvs = TlvParser.parse(response.data)
    val root = tlvs.firstOrNull()
      ?: throw EmvException(EmvError.PARSE_ERROR, "GPO sem dados")

    return when (root.tag) {
      // Formato 1: AIP (2 bytes) seguido do AFL, sem tags internas.
      EmvTags.RESPONSE_FORMAT_1 -> {
        if (root.value.size < 2) throw EmvException(EmvError.PARSE_ERROR, "GPO formato 1 sem AIP")
        listOf(
          syntheticTlv(EmvTags.AIP, root.value.copyOfRange(0, 2)),
          syntheticTlv(EmvTags.AFL, root.value.copyOfRange(2, root.value.size)),
        )
      }
      // Formato 2: template 77 com AIP, AFL e, em qVSDC, já o Track 2 e o criptograma.
      EmvTags.RESPONSE_FORMAT_2 -> root.children
      else -> throw EmvException(EmvError.PARSE_ERROR, "GPO com template inesperado ${tagHex(root.tag)}")
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
      sensitiveBuffers += response.data
      try {
        records += TlvParser.parse(response.data)
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
    var current = command
    var response = transmit(current)
    // ISO 7816-4: 6Cxx pede reenvio com Le = xx; 61xx indica bytes a buscar com GET RESPONSE.
    if (response.sw1 == ResponseApdu.SW1_WRONG_LE) {
      current = current.withLe(response.sw2)
      response = transmit(current)
    }
    var data = response.data
    var guard = 0
    while (response.sw1 == ResponseApdu.SW1_BYTES_AVAILABLE && guard++ < 16) {
      response = transmit(Commands.getResponse(response.sw2))
      data += response.data
    }
    if (data.size != response.data.size) {
      response = ResponseApdu(data + byteArrayOf(response.sw1.toByte(), response.sw2.toByte()))
    }
    val durationMs = (clock.monotonicNanos() - start) / 1_000_000.0
    durations[step] = (durations[step] ?: 0.0) + durationMs

    diagnostics?.onExchange(
      ApduExchange(
        step = step,
        command = command.toBytes().toHex(),
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
    return ResponseApdu(raw).also { sensitiveBuffers += raw }
  }

  private fun syntheticTlv(tag: Int, value: ByteArray) =
    Tlv(tag, byteArrayOf(tag.toByte(), value.size.toByte()), value, emptyList())

  private fun ascii(bytes: ByteArray) = String(bytes, Charsets.US_ASCII).trim()
}
