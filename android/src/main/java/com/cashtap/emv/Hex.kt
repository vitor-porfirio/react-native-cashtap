package com.cashtap.emv

/** Conversão entre bytes e hexadecimal. Bytes são tratados sem sinal. */
object Hex {
  private val DIGITS = "0123456789ABCDEF".toCharArray()

  fun encode(bytes: ByteArray): String {
    val out = CharArray(bytes.size * 2)
    bytes.forEachIndexed { index, byte ->
      val value = byte.toInt() and 0xFF
      out[index * 2] = DIGITS[value ushr 4]
      out[index * 2 + 1] = DIGITS[value and 0x0F]
    }
    return String(out)
  }

  /** Aceita maiúsculas, minúsculas e espaços. Rejeita número ímpar de dígitos e caracteres não hex. */
  fun decode(hex: String): ByteArray {
    val clean = hex.filterNot { it.isWhitespace() }
    require(clean.length % 2 == 0) { "hex com número ímpar de dígitos: ${clean.length}" }
    return ByteArray(clean.length / 2) { index ->
      val high = hexValue(clean[index * 2])
      val low = hexValue(clean[index * 2 + 1])
      require(high >= 0 && low >= 0) { "caractere não hexadecimal na posição ${index * 2}" }
      ((high shl 4) or low).toByte()
    }
  }
}

private fun hexValue(char: Char): Int = when (char) {
  in '0'..'9' -> char - '0'
  in 'A'..'F' -> char - 'A' + 10
  in 'a'..'f' -> char - 'a' + 10
  else -> -1
}

fun ByteArray.toHex(): String = Hex.encode(this)

fun String.hexToBytes(): ByteArray = Hex.decode(this)

/** Byte sem sinal como Int (0..255). */
internal fun ByteArray.u8(index: Int): Int = this[index].toInt() and 0xFF
