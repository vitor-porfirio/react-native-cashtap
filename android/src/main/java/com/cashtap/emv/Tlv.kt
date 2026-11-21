package com.cashtap.emv

/**
 * Elemento BER-TLV. `tag` guarda todos os bytes da tag num Int (ex.: 0x9F38).
 * `header` são os bytes originais de tag + comprimento, preservados para que o
 * diagnóstico reproduza a resposta como ela veio do cartão.
 */
class Tlv(
  val tag: Int,
  val header: ByteArray,
  val value: ByteArray,
  val children: List<Tlv>,
) {
  val isConstructed: Boolean get() = (header.u8(0) and 0x20) != 0

  /** Busca em profundidade, incluindo este elemento. */
  fun find(tag: Int): Tlv? = if (this.tag == tag) this else children.find(tag)

  fun findAll(tag: Int): List<Tlv> =
    (if (this.tag == tag) listOf(this) else emptyList()) + children.findAll(tag)

  override fun toString(): String = "Tlv(${tagHex(tag)}, ${value.size} bytes)"
}

fun List<Tlv>.find(tag: Int): Tlv? = firstNotNullOfOrNull { it.find(tag) }

fun List<Tlv>.findAll(tag: Int): List<Tlv> = flatMap { it.findAll(tag) }

fun tagHex(tag: Int): String = Integer.toHexString(tag).uppercase().let { if (it.length % 2 == 1) "0$it" else it }

/** Entrada de uma Data Object List (PDOL): tag e comprimento exigido, sem valor. */
data class DolEntry(val tag: Int, val length: Int)

/**
 * Decodificador BER-TLV conforme EMV Book 3, Anexo B:
 * - tag de múltiplos bytes quando os 5 bits baixos do primeiro byte são 1F,
 *   continuando enquanto o bit 8 do byte seguinte estiver ligado;
 * - comprimento curto (< 0x80) ou longo (81 xx, 82 xx xx, 83 xx xx xx);
 * - bit 6 do primeiro byte indica objeto construído, cujo valor é decodificado recursivamente;
 * - bytes 00 e FF entre objetos são preenchimento e são ignorados.
 * Entrada malformada lança [EmvException] com [EmvError.PARSE_ERROR], nunca outra exceção.
 */
object TlvParser {
  private const val MAX_DEPTH = 16
  private const val MAX_TAG_BYTES = 3

  fun parse(bytes: ByteArray): List<Tlv> = parse(bytes, 0, bytes.size, 0)

  /** DOL: sequência de (tag, comprimento de 1 byte), sem valores (EMV Book 3, 5.4). */
  fun parseDol(bytes: ByteArray): List<DolEntry> {
    val entries = mutableListOf<DolEntry>()
    var offset = 0
    while (offset < bytes.size) {
      val (tag, afterTag) = readTag(bytes, offset, bytes.size)
      if (afterTag >= bytes.size) fail("DOL truncado após a tag ${tagHex(tag)}")
      entries += DolEntry(tag, bytes.u8(afterTag))
      offset = afterTag + 1
    }
    return entries
  }

  private fun parse(bytes: ByteArray, start: Int, end: Int, depth: Int): List<Tlv> {
    if (depth > MAX_DEPTH) fail("aninhamento acima de $MAX_DEPTH níveis")
    val result = mutableListOf<Tlv>()
    var offset = start
    while (offset < end) {
      val first = bytes.u8(offset)
      if (first == 0x00 || first == 0xFF) {
        offset++
        continue
      }
      val (tag, afterTag) = readTag(bytes, offset, end)
      val (length, afterLength) = readLength(bytes, afterTag, end, tag)
      if (length > end - afterLength) {
        fail("tag ${tagHex(tag)} declara $length bytes, restam ${end - afterLength}")
      }
      val valueEnd = afterLength + length
      val constructed = (first and 0x20) != 0
      val children = if (constructed) parse(bytes, afterLength, valueEnd, depth + 1) else emptyList()
      result += Tlv(
        tag = tag,
        header = bytes.copyOfRange(offset, afterLength),
        value = bytes.copyOfRange(afterLength, valueEnd),
        children = children,
      )
      offset = valueEnd
    }
    return result
  }

  private fun readTag(bytes: ByteArray, start: Int, end: Int): Pair<Int, Int> {
    var offset = start
    val first = bytes.u8(offset++)
    var tag = first
    if ((first and 0x1F) == 0x1F) {
      var count = 1
      do {
        if (offset >= end) fail("tag truncada")
        val next = bytes.u8(offset++)
        tag = (tag shl 8) or next
        count++
        if (count > MAX_TAG_BYTES) fail("tag com mais de $MAX_TAG_BYTES bytes")
      } while ((next and 0x80) != 0)
    }
    return tag to offset
  }

  private fun readLength(bytes: ByteArray, start: Int, end: Int, tag: Int): Pair<Int, Int> {
    if (start >= end) fail("comprimento ausente na tag ${tagHex(tag)}")
    val first = bytes.u8(start)
    if (first < 0x80) return first to start + 1
    val count = first and 0x7F
    if (count == 0 || count > 3) fail("forma de comprimento não suportada: ${"%02X".format(first)} na tag ${tagHex(tag)}")
    if (start + count >= end) fail("comprimento truncado na tag ${tagHex(tag)}")
    var length = 0
    for (i in 1..count) {
      length = (length shl 8) or bytes.u8(start + i)
    }
    return length to start + 1 + count
  }

  private fun fail(detail: String): Nothing = throw EmvException(EmvError.PARSE_ERROR, detail)
}
