package com.cashtap.emv

import com.cashtap.emv.Fixtures.c
import com.cashtap.emv.Fixtures.p
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class CardDataExtractorTest {
  private fun extract(vararg hex: String) =
    CardDataExtractor.extract(hex.flatMap { TlvParser.parse(it.hexToBytes()) })

  @Test
  fun `RN-18 - PAN vem da tag 5A quando presente`() {
    val card = extract(c("70", p("5A", Fixtures.MASTERCARD_PAN), p("5F24", "251231")))
    assertEquals(Fixtures.MASTERCARD_PAN, card.pan)
  }

  @Test
  fun `E4-H2 - PAN com número ímpar de dígitos perde o padding F`() {
    val card = extract(c("70", p("5A", "4222222222222F"), p("5F24", "301131")))
    assertEquals("4222222222222", card.pan)
  }

  @Test
  fun `RN-18 - sem 5A, PAN vem do Track 2 antes do separador D`() {
    val card = extract(Fixtures.VISA_GPO, Fixtures.VISA_RECORD_1_1)
    assertEquals(Fixtures.VISA_PAN, card.pan)
  }

  @Test
  fun `5A tem prioridade sobre o Track 2`() {
    val card = extract(c("70", p("57", "${Fixtures.VISA_PAN}D25122010F"), p("5A", Fixtures.MASTERCARD_PAN), p("5F24", "251231")))
    assertEquals(Fixtures.MASTERCARD_PAN, card.pan)
  }

  @Test
  fun `RN-19 - validade de 5F24 normalizada para AAMM`() {
    assertEquals("2512", extract(c("70", p("5A", Fixtures.MASTERCARD_PAN), p("5F24", "251231"))).expiry)
  }

  @Test
  fun `RN-19 - sem 5F24, validade são os 4 dígitos após o D`() {
    val card = extract(c("77", p("57", "${Fixtures.VISA_PAN}D27082010000000F")))
    assertEquals("2708", card.expiry)
  }

  @Test
  fun `Mastercard - Track 2 da tag 9F6B como último recurso`() {
    val card = extract(c("70", p("9F6B", "${Fixtures.MASTERCARD_PAN}D2512201000000000F")))
    assertEquals(Fixtures.MASTERCARD_PAN, card.pan)
    assertEquals("2512", card.expiry)
  }

  @Test
  fun `sequencial do cartão (5F34) quando presente`() {
    assertEquals("01", extract(Fixtures.VISA_GPO).panSequenceNumber)
    assertNull(extract(c("70", p("5A", Fixtures.MASTERCARD_PAN), p("5F24", "251231"))).panSequenceNumber)
  }

  @Test
  fun `RN-21 - sem PAN é INCOMPLETE_DATA`() {
    assertError(EmvError.INCOMPLETE_DATA, c("70", p("5F24", "251231")))
  }

  @Test
  fun `RN-21 - sem validade é INCOMPLETE_DATA, nunca sucesso parcial`() {
    assertError(EmvError.INCOMPLETE_DATA, c("70", p("5A", Fixtures.MASTERCARD_PAN)))
  }

  @Test
  fun `PAN que falha no Luhn é PARSE_ERROR`() {
    assertError(EmvError.PARSE_ERROR, c("70", p("5A", "4761739001010011"), p("5F24", "251231")))
  }

  @Test
  fun `PAN com dígito não decimal é PARSE_ERROR`() {
    assertError(EmvError.PARSE_ERROR, c("70", p("5A", "47617390010100AB"), p("5F24", "251231")))
  }

  @Test
  fun `mês inválido na validade é PARSE_ERROR`() {
    assertError(EmvError.PARSE_ERROR, c("70", p("5A", Fixtures.MASTERCARD_PAN), p("5F24", "251331")))
  }

  @Test
  fun `D015 - Track 2 sem separador é PARSE_ERROR (corrompido, recuperável)`() {
    assertError(EmvError.PARSE_ERROR, c("70", p("57", Fixtures.VISA_PAN)))
  }

  @Test
  fun `Track 2 corrompido é irrelevante quando 5A e 5F24 existem`() {
    val card = extract(c("70", p("57", Fixtures.VISA_PAN), p("5A", Fixtures.MASTERCARD_PAN), p("5F24", "251231")))
    assertEquals(Fixtures.MASTERCARD_PAN, card.pan)
  }

  @Test
  fun `RN-19 - 5F24 tem prioridade sobre a validade do Track 2`() {
    val card = extract(c("70", p("57", "${Fixtures.VISA_PAN}D27082010000000F"), p("5F24", "251231")))
    assertEquals("2512", card.expiry)
  }

  @Test
  fun `D015 - Track 2 da tag 57 tem prioridade sobre o da 9F6B`() {
    val card = extract(
      c(
        "70",
        p("9F6B", "${Fixtures.MASTERCARD_PAN}D2512201000000000F"),
        p("57", "${Fixtures.VISA_PAN}D27082010000000F"),
      )
    )
    assertEquals(Fixtures.VISA_PAN, card.pan)
    assertEquals("2708", card.expiry)
  }

  @Test
  fun `RN-23 - toString não imprime o PAN`() {
    val card = extract(c("70", p("5A", Fixtures.MASTERCARD_PAN), p("5F24", "251231")))
    assertFalse(card.toString().contains(Fixtures.MASTERCARD_PAN))
    assertTrue(card.toString().contains("541333******0434"))
  }

  @Test
  fun `Luhn reconhece os PANs de teste`() {
    assertTrue(CardDataExtractor.isLuhnValid(Fixtures.VISA_PAN))
    assertTrue(CardDataExtractor.isLuhnValid(Fixtures.MASTERCARD_PAN))
    assertFalse(CardDataExtractor.isLuhnValid("4761739001010011"))
  }

  private fun assertError(expected: EmvError, vararg hex: String) {
    try {
      extract(*hex)
      fail("deveria falhar com $expected")
    } catch (e: EmvException) {
      assertEquals(expected, e.error)
      assertFalse("detail não pode conter o PAN", e.detail.contains(Fixtures.MASTERCARD_PAN))
    }
  }
}
