package com.cashtap.emv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MaskingTest {
  @Test
  fun `RN-24 - PAN mascarado mantém 6 primeiros e 4 últimos`() {
    assertEquals("476173******0010", Masking.maskPan(Fixtures.VISA_PAN))
    assertEquals("541333******0434", Masking.maskPan(Fixtures.MASTERCARD_PAN))
  }

  @Test
  fun `PAN de 13 dígitos`() {
    assertEquals("422222***2222", Masking.maskPan("4222222222222"))
  }

  @Test
  fun `PAN curto demais é mascarado por inteiro`() {
    assertEquals("**********", Masking.maskPan("1234567890"))
  }

  @Test
  fun `RN-23 - resposta do GPO Visa não expõe Track 2 nem criptograma`() {
    val masked = Masking.maskResponseData(Fixtures.VISA_GPO.hexToBytes())
    assertFalse(masked.contains(Fixtures.VISA_PAN))
    assertFalse(masked.contains("0102030405060708"))
    assertTrue("estrutura e tags não sensíveis continuam visíveis", masked.startsWith("77"))
    assertTrue(masked.contains("82022000"))
    assertTrue(masked.contains("5713**"))
  }

  @Test
  fun `RN-23 - registros Mastercard não expõem PAN, Track 2 nem 9F6B`() {
    listOf(Fixtures.MASTERCARD_RECORD_1_1, Fixtures.MASTERCARD_RECORD_2_1).forEach { record ->
      val masked = Masking.maskResponseData(record.hexToBytes())
      assertFalse(masked.contains(Fixtures.MASTERCARD_PAN))
    }
  }

  @Test
  fun `RN-23 - nome do portador e Track 1 discricionário mascarados`() {
    val masked = Masking.maskResponseData(Fixtures.VISA_RECORD_1_1.hexToBytes())
    assertFalse(masked.contains(Fixtures.ascii("TESTE/CARTAO")))
    assertFalse(masked.contains("31323334"))
    assertTrue("validade não é sensível", masked.contains("5F2403251231"))
  }

  @Test
  fun `RN-23 - toda tag sensível conhecida sai mascarada, com o PAN dentro do valor`() {
    for (tag in EmvTags.SENSITIVE) {
      val value = Fixtures.VISA_PAN + "D2512" // PAN em BCD dentro do valor
      val data = Fixtures.p(tagHex(tag), value + "0")
      val masked = Masking.maskResponseData(data.hexToBytes())
      assertFalse("tag ${tagHex(tag)} vazou o PAN", masked.contains(Fixtures.VISA_PAN))
      assertTrue("tag ${tagHex(tag)} deveria ser mascarada", masked.contains("**"))
    }
  }

  @Test
  fun `RN-23 - Track 1 (56) em ASCII não vaza o PAN`() {
    val track1 = Fixtures.ascii("B${Fixtures.VISA_PAN}^TESTE/CARTAO^2512201")
    val masked = Masking.maskResponseData(Fixtures.c("70", Fixtures.p("56", track1)).hexToBytes())
    assertFalse(masked.contains(Fixtures.ascii(Fixtures.VISA_PAN)))
  }

  @Test
  fun `D016 - certificado do ICC (9F46) e tags desconhecidas são mascarados por padrão`() {
    val masked = Masking.maskResponseData(
      Fixtures.c("70", Fixtures.p("9F46", "AB".repeat(20)), Fixtures.p("DF8199", "CDCD")).hexToBytes()
    )
    assertFalse(masked.contains("ABAB"))
    assertFalse(masked.contains("CDCD"))
  }

  @Test
  fun `allowlist e denylist não se sobrepõem`() {
    assertTrue(EmvTags.SENSITIVE.intersect(EmvTags.DIAGNOSTIC_CLEAR).isEmpty())
  }

  @Test
  fun `resposta que não é TLV não é exibida`() {
    val raw = "${Fixtures.VISA_PAN}FFFF".hexToBytes().copyOfRange(0, 7)
    val masked = Masking.maskResponseData(raw)
    assertFalse(masked.contains(Fixtures.VISA_PAN.take(8)))
  }

  @Test
  fun `RN-26 - a cópia decodificada para o diagnóstico é zerada`() {
    var decoded: List<Tlv> = emptyList()
    Masking.wipeObserver = { decoded = it }
    try {
      Masking.maskResponseData(Fixtures.VISA_GPO.hexToBytes())
    } finally {
      Masking.wipeObserver = null
    }
    fun allZero(t: Tlv): Boolean =
      t.value.all { it == 0.toByte() } && t.header.all { it == 0.toByte() } && t.children.all(::allZero)
    assertTrue(decoded.isNotEmpty())
    assertTrue(decoded.all(::allZero))
  }

  @Test
  fun `diagnóstico não altera a entrada, que pertence ao chamador`() {
    val data = Fixtures.VISA_GPO.hexToBytes()
    val copy = data.copyOf()
    Masking.maskResponseData(data)
    assertTrue(data.contentEquals(copy))
  }

  @Test
  fun `resposta vazia vira string vazia`() {
    assertEquals("", Masking.maskResponseData(ByteArray(0)))
  }
}
