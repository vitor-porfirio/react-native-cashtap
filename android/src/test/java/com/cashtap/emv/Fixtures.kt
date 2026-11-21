package com.cashtap.emv

/**
 * Vetores EMV sintéticos para os testes, montados a partir da estrutura descrita
 * no EMV Book 1/3 e no Book C-2. Usam apenas PANs de teste públicos (security.md).
 * Quando houver captura de cartão real (com PAN alterado), ela entra aqui como
 * vetor adicional, com a origem comentada.
 */
object Fixtures {
  const val VISA_PAN = "4761739001010010" // cartão de teste Visa (Luhn válido)
  const val MASTERCARD_PAN = "5413330089010434" // cartão de teste Mastercard (Luhn válido)

  const val VISA_AID = "A0000000031010"
  const val MASTERCARD_AID = "A0000000041010"

  // ---- Construção TLV ----

  fun p(tag: String, valueHex: String): String = encode(tag, valueHex.hexToBytes())

  fun c(tag: String, vararg children: String): String = encode(tag, children.joinToString("").hexToBytes())

  fun ascii(text: String): String = text.toByteArray(Charsets.US_ASCII).toHex()

  private fun encode(tag: String, value: ByteArray): String {
    val length = when {
      value.size < 0x80 -> "%02X".format(value.size)
      value.size <= 0xFF -> "81%02X".format(value.size)
      else -> "82%04X".format(value.size)
    }
    return tag + length + value.toHex()
  }

  // ---- Visa (qVSDC): PDOL presente, GPO formato 2 com Track 2, sem 5A ----

  val VISA_PPSE = c(
    "6F",
    p("84", ascii("2PAY.SYS.DDF01")),
    c("A5", c("BF0C", c("61", p("4F", VISA_AID), p("50", ascii("VISA CREDITO")), p("87", "01")))),
  )

  const val VISA_PDOL = "9F66049F02069F03069F1A0295055F2A029A039C019F3704"

  val VISA_SELECT = c(
    "6F",
    p("84", VISA_AID),
    c("A5", p("50", ascii("VISA CREDITO")), p("87", "01"), p("9F38", VISA_PDOL)),
  )

  val VISA_GPO = c(
    "77",
    p("82", "2000"),
    p("94", "08010100"),
    p("57", "${VISA_PAN}D25122010000000000000F"),
    p("5F34", "01"),
    p("9F26", "0102030405060708"),
    p("9F10", "06011203A00000"),
    p("9F36", "0001"),
  )

  val VISA_RECORD_1_1 = c(
    "70",
    p("5F24", "251231"),
    p("5F20", ascii("TESTE/CARTAO")),
    p("9F1F", "31323334"),
  )

  // ---- Mastercard (M/Chip): sem PDOL, GPO formato 1, dados em registros ----

  val MASTERCARD_PPSE = c(
    "6F",
    p("84", ascii("2PAY.SYS.DDF01")),
    c("A5", c("BF0C", c("61", p("4F", MASTERCARD_AID), p("50", ascii("MASTERCARD")), p("87", "01")))),
  )

  val MASTERCARD_SELECT = c(
    "6F",
    p("84", MASTERCARD_AID),
    c("A5", p("50", ascii("MASTERCARD"))),
  )

  /** AIP 1980; AFL: SFI 1 registro 1; SFI 2 registros 1 a 3. */
  val MASTERCARD_GPO = p("80", "1980" + "08010100" + "10010300")

  val MASTERCARD_RECORD_1_1 = c(
    "70",
    p("57", "${MASTERCARD_PAN}D25122010000000000000F"),
    p("9F6B", "${MASTERCARD_PAN}D2512201000000000F"),
  )

  val MASTERCARD_RECORD_2_1 = c(
    "70",
    p("5A", MASTERCARD_PAN),
    p("5F24", "251231"),
    p("5F34", "00"),
  )

  val MASTERCARD_RECORD_2_3 = c("70", p("8C", "9F02069F03069F1A0295055F2A029A039C019F3704"))

  const val OK = "9000"
}
