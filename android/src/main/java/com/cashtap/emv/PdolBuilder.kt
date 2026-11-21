package com.cashtap.emv

import java.security.SecureRandom
import java.util.Calendar
import java.util.Random
import java.util.TimeZone

/**
 * Dados do terminal usados para responder ao PDOL.
 * `currencyCode` e `countryCode` são códigos ISO numéricos de 4 dígitos (ex.: "0986", "0076").
 */
data class TerminalData(
  val amountCents: Long,
  val currencyCode: String = "0986",
  val countryCode: String = "0076",
) {
  init {
    require(amountCents in 0..999_999_999_999) { "valor fora da faixa n12" }
    require(currencyCode.length == 4 && currencyCode.all(Char::isDigit)) { "moeda deve ter 4 dígitos" }
    require(countryCode.length == 4 && countryCode.all(Char::isDigit)) { "país deve ter 4 dígitos" }
  }
}

/**
 * Monta os dados do GPO a partir do PDOL do cartão (RN-16, E3-H4).
 * Cada entrada é preenchida com exatamente o comprimento pedido: dados numéricos
 * são completados com zeros à esquerda e, se longos, truncados à esquerda; os
 * demais são completados com zeros à direita e truncados à direita (EMV Book 3, 5.4).
 * Tags desconhecidas vão zeradas — o SDK não pede autorização, então não há valor real a informar.
 */
class PdolBuilder(
  private val terminal: TerminalData,
  private val clock: Clock = Clock.System,
  private val random: Random = SecureRandom(),
  private val timeZone: TimeZone = TimeZone.getDefault(),
) {
  fun build(entries: List<DolEntry>): ByteArray {
    val now = Calendar.getInstance(timeZone).apply { timeInMillis = clock.currentTimeMillis() }
    val unpredictable = ByteArray(4).also(random::nextBytes)
    return entries.fold(ByteArray(0)) { acc, entry ->
      acc + fit(entry, valueFor(entry.tag, now, unpredictable))
    }
  }

  private fun valueFor(tag: Int, now: Calendar, unpredictable: ByteArray): ByteArray? = when (tag) {
    EmvTags.AMOUNT_AUTHORISED -> bcd(terminal.amountCents.toString().padStart(12, '0'))
    EmvTags.AMOUNT_OTHER -> ByteArray(6)
    EmvTags.TERMINAL_COUNTRY_CODE -> terminal.countryCode.hexToBytes()
    EmvTags.TRANSACTION_CURRENCY_CODE -> terminal.currencyCode.hexToBytes()
    EmvTags.TVR -> ByteArray(5)
    EmvTags.TRANSACTION_DATE -> bcd(
      two(now.get(Calendar.YEAR) % 100) + two(now.get(Calendar.MONTH) + 1) + two(now.get(Calendar.DAY_OF_MONTH))
    )
    EmvTags.TRANSACTION_TIME -> bcd(
      two(now.get(Calendar.HOUR_OF_DAY)) + two(now.get(Calendar.MINUTE)) + two(now.get(Calendar.SECOND))
    )
    EmvTags.TRANSACTION_TYPE -> byteArrayOf(0x00) // compra
    EmvTags.UNPREDICTABLE_NUMBER -> unpredictable
    EmvTags.TTQ -> TTQ
    EmvTags.TERMINAL_TYPE -> byteArrayOf(0x22) // atendido, comerciante, capaz de online
    EmvTags.TERMINAL_CAPABILITIES -> TERMINAL_CAPABILITIES
    EmvTags.ADDITIONAL_TERMINAL_CAPABILITIES -> ADDITIONAL_CAPABILITIES
    EmvTags.MERCHANT_NAME_LOCATION -> "CashTap".toByteArray(Charsets.US_ASCII)
    else -> null
  }

  private fun fit(entry: DolEntry, value: ByteArray?): ByteArray {
    if (value == null) return ByteArray(entry.length)
    val numeric = entry.tag in EmvTags.NUMERIC
    return when {
      value.size == entry.length -> value
      value.size > entry.length ->
        if (numeric) value.copyOfRange(value.size - entry.length, value.size) else value.copyOfRange(0, entry.length)
      else ->
        if (numeric) ByteArray(entry.length - value.size) + value else value + ByteArray(entry.length - value.size)
    }
  }

  private fun two(value: Int) = value.toString().padStart(2, '0')

  private fun bcd(digits: String): ByteArray = digits.hexToBytes()

  companion object {
    /**
     * Terminal Transaction Qualifiers (Visa qVSDC): byte 1 = 0x36 (qVSDC, chip de contato,
     * PIN online e assinatura suportados); byte 3 = 0x40 (CVM no dispositivo do portador suportado).
     */
    private val TTQ = "36004000".hexToBytes()
    private val TERMINAL_CAPABILITIES = "E0F0C8".hexToBytes()
    private val ADDITIONAL_CAPABILITIES = "6000F0A001".hexToBytes()
  }
}
