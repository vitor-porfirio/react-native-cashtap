package com.cashtap.emv

/** Bandeiras suportadas. `wireName` é o valor que atravessa a ponte para o TS. */
enum class CardBrand(val wireName: String) {
  VISA("visa"),
  MASTERCARD("mastercard"),
}

/**
 * Registro de AIDs conhecidos. A bandeira é inferida pelo RID (5 primeiros
 * bytes do AID), nunca pelo PAN (RN-20).
 */
object AidRegistry {
  private val BRAND_BY_RID = mapOf(
    "A000000003" to CardBrand.VISA,
    "A000000004" to CardBrand.MASTERCARD,
  )

  /** AIDs tentados em SELECT direto quando o PPSE responde 6A82 (RN-15). */
  val FALLBACK_AIDS: List<ByteArray> = listOf(
    "A0000000031010", // Visa crédito/débito
    "A0000000032010", // Visa Electron
    "A0000000041010", // Mastercard crédito/débito
    "A0000000043060", // Maestro
  ).map { it.hexToBytes() }

  fun brandOf(aid: ByteArray): CardBrand? {
    if (aid.size < 5) return null
    return BRAND_BY_RID[aid.copyOfRange(0, 5).toHex()]
  }
}
