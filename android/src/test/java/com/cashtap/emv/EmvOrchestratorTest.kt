package com.cashtap.emv

import com.cashtap.emv.Fixtures.c
import com.cashtap.emv.Fixtures.p
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.util.Random

class EmvOrchestratorTest {
  private val terminal = TerminalData(amountCents = 1_000)

  private fun orchestrator(
    card: FakeTransceiver,
    diagnostics: DiagnosticSink? = null,
    logger: Logger = Logger.None,
    isCancelled: () -> Boolean = { false },
  ) = EmvOrchestrator(
    transceiver = card,
    terminal = terminal,
    clock = FakeClock(),
    logger = logger,
    diagnostics = diagnostics,
    isCancelled = isCancelled,
    pdolBuilder = PdolBuilder(terminal, FakeClock(), Random(7)),
  )

  // ---- Caminho feliz ----

  @Test
  fun `Visa - PPSE, AID, GPO com PDOL e READ RECORD`() {
    val card = FakeTransceiver.visa()
    val result = orchestrator(card).read()

    assertEquals(Fixtures.VISA_PAN, result.pan)
    assertEquals("476173******0010", result.panMasked)
    assertEquals("2512", result.expiry)
    assertEquals(CardBrand.VISA, result.brand)
    assertEquals(Fixtures.VISA_AID, result.aid)
    assertEquals("VISA CREDITO", result.applicationLabel)
    assertEquals("01", result.panSequenceNumber)
    assertTrue(result.cryptogramPresent)

    // RN-12: começa pelo PPSE; RN-16: GPO com os 33 bytes do PDOL em 83 21
    assertTrue(card.sent[0].startsWith("00A404000E325041592E5359532E4444463031"))
    assertTrue(card.sent[1].startsWith("00A4040007A0000000031010"))
    assertTrue(card.sent[2].startsWith("80A80000238321"))
    assertEquals("00B2010C00", card.sent[3])
    assertEquals(4, card.sent.size)
  }

  @Test
  fun `Mastercard - sem PDOL envia 83 00 e lê os registros do AFL`() {
    val card = FakeTransceiver.mastercard()
    val result = orchestrator(card).read()

    assertEquals(Fixtures.MASTERCARD_PAN, result.pan)
    assertEquals("2512", result.expiry)
    assertEquals(CardBrand.MASTERCARD, result.brand)
    assertEquals("MASTERCARD", result.applicationLabel)
    assertFalse(result.cryptogramPresent)
    assertEquals("80A8000002830000", card.sent[2])
    // RN-17: exatamente SFI1/1, SFI2/1, SFI2/2, SFI2/3
    assertEquals(listOf("00B2010C00", "00B2011400", "00B2021400", "00B2031400"), card.sent.drop(3))
  }

  @Test
  fun `E3-H5 - registro com erro (6A83) não aborta a leitura`() {
    val logger = RecordingLogger()
    val result = orchestrator(FakeTransceiver.mastercard(), logger = logger).read()
    assertEquals(Fixtures.MASTERCARD_PAN, result.pan)
    assertTrue(logger.lines.any { it.contains("6A83") })
  }

  @Test
  fun `E8-H2 - mede o tempo das 4 etapas`() {
    val result = orchestrator(FakeTransceiver.mastercard()).read()
    assertEquals(EmvStep.values().toSet(), result.stepDurationsMs.keys)
    assertTrue(result.stepDurationsMs.values.all { it > 0.0 })
    // 4 READ RECORD de 5 ms cada no relógio fake
    assertEquals(20.0, result.stepDurationsMs.getValue(EmvStep.READ_RECORD), 0.001)
  }

  // ---- Seleção de aplicação ----

  @Test
  fun `RN-15 - PPSE 6A82 dispara SELECT AID direto com os AIDs conhecidos`() {
    val card = FakeTransceiver.mastercard()
      .on(Commands.selectByName(Commands.PPSE_NAME), "6A82")
    val result = orchestrator(card).read()

    assertEquals(CardBrand.MASTERCARD, result.brand)
    // tentou os AIDs Visa (6A82 do fake) antes de chegar ao Mastercard
    assertTrue(card.sent.any { it.startsWith("00A4040007A0000000031010") })
    assertTrue(card.sent.any { it.startsWith("00A4040007A0000000041010") })
    assertEquals("MASTERCARD", result.applicationLabel)
  }

  @Test
  fun `RN-15 - PPSE com outro erro é PROTOCOL_ERROR`() {
    val card = FakeTransceiver.visa().on(Commands.selectByName(Commands.PPSE_NAME), "6985")
    assertError(EmvError.PROTOCOL_ERROR) { orchestrator(card).read() }
  }

  @Test
  fun `RN-13 - várias aplicações - escolhe a suportada de maior prioridade`() {
    val ppse = c(
      "6F",
      c(
        "A5",
        c(
          "BF0C",
          c("61", p("4F", "A0000004941010"), p("87", "01")), // Elo: não suportado
          c("61", p("4F", Fixtures.VISA_AID), p("87", "03")),
          c("61", p("4F", Fixtures.MASTERCARD_AID), p("87", "02")),
        ),
      ),
    )
    val card = FakeTransceiver.mastercard().on(Commands.selectByName(Commands.PPSE_NAME), ppse + Fixtures.OK)
    val result = orchestrator(card).read()
    assertEquals(CardBrand.MASTERCARD, result.brand)
    assertFalse("não tentou o AID Elo", card.sent.any { it.contains("A0000004941010") })
  }

  @Test
  fun `RN-13 - nenhuma aplicação suportada é UNSUPPORTED_BRAND`() {
    val ppse = c("6F", c("A5", c("BF0C", c("61", p("4F", "A0000004941010")))))
    val card = FakeTransceiver().on(Commands.selectByName(Commands.PPSE_NAME), ppse + Fixtures.OK)
    assertError(EmvError.UNSUPPORTED_BRAND) { orchestrator(card).read() }
  }

  @Test
  fun `fallback sem nenhum AID aceito é UNSUPPORTED_BRAND`() {
    val card = FakeTransceiver() // tudo responde 6A82
    assertError(EmvError.UNSUPPORTED_BRAND) { orchestrator(card).read() }
  }

  // ---- GPO ----

  @Test
  fun `GPO recusado é PROTOCOL_ERROR`() {
    val card = FakeTransceiver.visa().onPrefix("80A80000", "6985")
    assertError(EmvError.PROTOCOL_ERROR) { orchestrator(card).read() }
  }

  @Test
  fun `GPO com template inesperado é PARSE_ERROR`() {
    val card = FakeTransceiver.visa().onPrefix("80A80000", p("71", "00") + Fixtures.OK)
    assertError(EmvError.PARSE_ERROR) { orchestrator(card).read() }
  }

  @Test
  fun `GPO formato 2 sem AFL não lê registros`() {
    val gpo = c("77", p("82", "2000"), p("57", "${Fixtures.VISA_PAN}D25122010000000000000F"))
    val card = FakeTransceiver.visa().onPrefix("80A80000", gpo + Fixtures.OK)
    val result = orchestrator(card).read()
    assertEquals("2512", result.expiry)
    assertEquals(3, card.sent.size)
  }

  @Test
  fun `RN-21 - dados incompletos ao final é INCOMPLETE_DATA`() {
    val gpo = c("77", p("82", "2000"), p("94", "08010100"))
    val card = FakeTransceiver.visa()
      .onPrefix("80A80000", gpo + Fixtures.OK)
      .on(Commands.readRecord(1, 1), c("70", p("5F24", "251231")) + Fixtures.OK)
    assertError(EmvError.INCOMPLETE_DATA) { orchestrator(card).read() }
  }

  // ---- Link e cancelamento ----

  @Test
  fun `RN-07 - cartão removido no meio do diálogo é CARD_REMOVED`() {
    val card = FakeTransceiver.visa().apply { loseLinkOnCall = 3 }
    assertError(EmvError.CARD_REMOVED) { orchestrator(card).read() }
  }

  @Test
  fun `RN-10 - cancelamento é verificado entre comandos, nunca no meio de uma troca`() {
    val card = FakeTransceiver.visa()
    var calls = 0
    assertError(EmvError.CANCELLED_BY_USER) {
      orchestrator(card, isCancelled = { ++calls > 2 }).read()
    }
    assertEquals("as duas trocas anteriores terminaram inteiras", 2, card.sent.size)
  }

  // ---- ISO 7816-4: 61xx e 6Cxx ----

  @Test
  fun `6Cxx reenvia o comando com o Le correto`() {
    val card = FakeTransceiver.visa()
      .on(Commands.readRecord(1, 1), "6C${"%02X".format(Fixtures.VISA_RECORD_1_1.length / 2)}")
      .on(Commands.readRecord(1, 1).withLe(Fixtures.VISA_RECORD_1_1.length / 2), Fixtures.VISA_RECORD_1_1 + Fixtures.OK)
    assertEquals("2512", orchestrator(card).read().expiry)
  }

  @Test
  fun `61xx busca o restante com GET RESPONSE`() {
    val record = Fixtures.VISA_RECORD_1_1
    val half = record.length / 2 / 2 * 2
    val first = record.substring(0, half)
    val rest = record.substring(half)
    val card = FakeTransceiver.visa()
      .on(Commands.readRecord(1, 1), first + "61%02X".format(rest.length / 2))
      .on(Commands.getResponse(rest.length / 2), rest + Fixtures.OK)
    assertEquals("2512", orchestrator(card).read().expiry)
  }

  // ---- Segurança ----

  @Test
  fun `RN-23 - diagnóstico registra as 4 etapas sem PAN, Track 2 ou criptograma`() {
    val exchanges = mutableListOf<ApduExchange>()
    orchestrator(FakeTransceiver.visa(), diagnostics = { exchanges += it }).read()

    assertEquals(
      listOf(EmvStep.SELECT_PPSE, EmvStep.SELECT_AID, EmvStep.GET_PROCESSING_OPTIONS, EmvStep.READ_RECORD),
      exchanges.map { it.step },
    )
    assertTrue(exchanges.all { it.sw == "9000" })
    val everything = exchanges.joinToString { it.command + it.response }
    assertFalse(everything.contains(Fixtures.VISA_PAN))
    assertFalse(everything.contains("0102030405060708"))
  }

  @Test
  fun `RN-23 - log do orquestrador nunca contém o PAN`() {
    val logger = RecordingLogger()
    orchestrator(FakeTransceiver.mastercard(), logger = logger).read()
    assertTrue(logger.lines.isNotEmpty())
    assertFalse(logger.lines.any { it.contains(Fixtures.MASTERCARD_PAN) })
  }

  @Test
  fun `detail dos erros não contém o PAN`() {
    val corruptedPan = "5413330089010435" // dígito verificador errado
    val card = FakeTransceiver.mastercard()
      .on(Commands.readRecord(2, 1), c("70", p("5A", corruptedPan), p("5F24", "251231")) + Fixtures.OK)
    try {
      orchestrator(card).read()
      fail()
    } catch (e: EmvException) {
      assertEquals(EmvError.PARSE_ERROR, e.error)
      assertFalse(e.detail.contains(corruptedPan))
      assertFalse(e.message.orEmpty().contains(corruptedPan))
    }
  }

  private fun assertError(expected: EmvError, block: () -> Unit) {
    try {
      block()
      fail("deveria falhar com $expected")
    } catch (e: EmvException) {
      assertEquals(expected, e.error)
    }
  }
}
