package com.cashtap.emv

/** PAN e validade normalizados. `expiry` no formato AAMM. */
data class ExtractedCardData(
  val pan: String,
  val expiry: String,
  val panSequenceNumber: String?,
)

/**
 * Extrai PAN e validade dos TLVs coletados no diálogo (GPO + registros).
 * - PAN: 5A; na ausência, Track 2 (57, ou 9F6B em cartões Mastercard), dígitos antes do `D` (RN-18).
 * - Validade: 5F24 (AAMMDD → AAMM); na ausência, 4 dígitos após o `D` do Track 2 (RN-19).
 * - Sem PAN ou validade: INCOMPLETE_DATA, nunca sucesso parcial (RN-21, INV-4).
 */
object CardDataExtractor {
  private const val TRACK2_SEPARATOR = 'D'

  fun extract(tlvs: List<Tlv>): ExtractedCardData {
    val track2 = (tlvs.find(EmvTags.TRACK2_EQUIVALENT) ?: tlvs.find(EmvTags.TRACK2_MASTERCARD))
      ?.let { parseTrack2(it.value) }

    val pan = tlvs.find(EmvTags.PAN)?.let { bcdDigits(it.value, "PAN (5A)") } ?: track2?.first
    val expiry = tlvs.find(EmvTags.EXPIRY_DATE)?.let { expiryFrom5F24(it.value) } ?: track2?.second

    if (pan == null || expiry == null) {
      val missing = listOfNotNull("PAN".takeIf { pan == null }, "validade".takeIf { expiry == null })
      throw EmvException(EmvError.INCOMPLETE_DATA, "ausente: ${missing.joinToString()}")
    }
    validatePan(pan)
    validateExpiry(expiry)

    val sequence = tlvs.find(EmvTags.PAN_SEQUENCE_NUMBER)?.value?.toHex()
    return ExtractedCardData(pan, expiry, sequence)
  }

  /** Luhn (ISO/IEC 7812). */
  fun isLuhnValid(pan: String): Boolean {
    var sum = 0
    pan.reversed().forEachIndexed { index, char ->
      var digit = char - '0'
      if (index % 2 == 1) {
        digit *= 2
        if (digit > 9) digit -= 9
      }
      sum += digit
    }
    return sum % 10 == 0
  }

  private fun parseTrack2(value: ByteArray): Pair<String, String>? {
    val hex = value.toHex()
    val separator = hex.indexOf(TRACK2_SEPARATOR)
    if (separator <= 0 || separator + 4 >= hex.length + 1) return null
    val pan = hex.substring(0, separator)
    val expiry = hex.substring(separator + 1, (separator + 5).coerceAtMost(hex.length))
    if (expiry.length != 4) return null
    return pan to expiry
  }

  /** BCD; dígitos ímpares vêm completados com F, que é removido (E4-H2). */
  private fun bcdDigits(value: ByteArray, field: String): String {
    val digits = value.toHex().trimEnd('F')
    if (digits.isEmpty() || !digits.all(Char::isDigit)) {
      throw EmvException(EmvError.PARSE_ERROR, "$field não é BCD válido")
    }
    return digits
  }

  private fun expiryFrom5F24(value: ByteArray): String {
    if (value.size != 3) throw EmvException(EmvError.PARSE_ERROR, "5F24 com ${value.size} bytes, esperado 3")
    return bcdDigits(value, "validade (5F24)").take(4)
  }

  private fun validatePan(pan: String) {
    if (pan.length !in 12..19 || !pan.all(Char::isDigit)) {
      throw EmvException(EmvError.PARSE_ERROR, "PAN com formato inválido (${pan.length} dígitos)")
    }
    if (!isLuhnValid(pan)) {
      throw EmvException(EmvError.PARSE_ERROR, "PAN falhou no dígito verificador")
    }
  }

  private fun validateExpiry(expiry: String) {
    val month = expiry.drop(2).toIntOrNull()
    if (expiry.length != 4 || !expiry.all(Char::isDigit) || month == null || month !in 1..12) {
      throw EmvException(EmvError.PARSE_ERROR, "validade inválida")
    }
  }
}
