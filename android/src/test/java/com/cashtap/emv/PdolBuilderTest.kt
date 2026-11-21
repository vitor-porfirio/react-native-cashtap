package com.cashtap.emv

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar
import java.util.Random
import java.util.TimeZone

class PdolBuilderTest {
  private val utc = TimeZone.getTimeZone("UTC")

  /** 2026-11-21 13:45:09 UTC */
  private val clock = FakeClock(
    Calendar.getInstance(utc).apply { clear(); set(2026, Calendar.NOVEMBER, 21, 13, 45, 9) }.timeInMillis
  )

  private fun builder(amountCents: Long = 1_234) =
    PdolBuilder(TerminalData(amountCents), clock, Random(42), utc)

  @Test
  fun `E3-H4 - cada elemento do PDOL tem exatamente o comprimento pedido`() {
    val entries = TlvParser.parseDol(Fixtures.VISA_PDOL.hexToBytes())
    val data = builder().build(entries)
    assertEquals(entries.sumOf { it.length }, data.size)
  }

  @Test
  fun `E3-H4 - valores do terminal no lugar e na ordem do PDOL`() {
    val entries = TlvParser.parseDol(Fixtures.VISA_PDOL.hexToBytes())
    val hex = builder().build(entries).toHex()
    var offset = 0
    val fields = entries.associate { entry ->
      val value = hex.substring(offset, offset + entry.length * 2)
      offset += entry.length * 2
      entry.tag to value
    }
    assertEquals("36004000", fields[EmvTags.TTQ])
    assertEquals("000000001234", fields[EmvTags.AMOUNT_AUTHORISED])
    assertEquals("000000000000", fields[EmvTags.AMOUNT_OTHER])
    assertEquals("0076", fields[EmvTags.TERMINAL_COUNTRY_CODE])
    assertEquals("0000000000", fields[EmvTags.TVR])
    assertEquals("0986", fields[EmvTags.TRANSACTION_CURRENCY_CODE])
    assertEquals("261121", fields[EmvTags.TRANSACTION_DATE])
    assertEquals("00", fields[EmvTags.TRANSACTION_TYPE])
    assertEquals(8, fields.getValue(EmvTags.UNPREDICTABLE_NUMBER).length)
  }

  @Test
  fun `tag desconhecida vai zerada com o comprimento pedido`() {
    assertEquals("000000", builder().build(listOf(DolEntry(0xDF8117, 3))).toHex())
  }

  @Test
  fun `numérico menor que o pedido é completado com zeros à esquerda`() {
    assertEquals("000000000000001234", builder().build(listOf(DolEntry(EmvTags.AMOUNT_AUTHORISED, 9))).toHex())
  }

  @Test
  fun `numérico maior que o pedido é truncado à esquerda`() {
    assertEquals("1234", builder().build(listOf(DolEntry(EmvTags.AMOUNT_AUTHORISED, 2))).toHex())
  }

  @Test
  fun `não numérico menor que o pedido é completado com zeros à direita`() {
    assertEquals("3600400000", builder().build(listOf(DolEntry(EmvTags.TTQ, 5))).toHex())
  }

  @Test
  fun `não numérico maior que o pedido é truncado à direita`() {
    assertEquals("3600", builder().build(listOf(DolEntry(EmvTags.TTQ, 2))).toHex())
  }

  @Test
  fun `hora da transação em BCD`() {
    assertEquals("134509", builder().build(listOf(DolEntry(EmvTags.TRANSACTION_TIME, 3))).toHex())
  }

  @Test
  fun `PDOL vazio gera dados vazios`() {
    assertEquals(0, builder().build(emptyList()).size)
  }

  @Test(expected = IllegalArgumentException::class)
  fun `moeda precisa ter 4 dígitos`() {
    TerminalData(100, currencyCode = "986")
  }
}
