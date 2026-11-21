package com.cashtap.emv

/**
 * Mascaramento na origem (RN-23, RN-24). Tudo que sai do núcleo EMV para log,
 * evento ou diagnóstico passa por aqui.
 */
object Masking {
  private const val MASK_BYTE = "**"

  /** `123456******7890`: 6 primeiros e 4 últimos dígitos. PAN curto é mascarado por inteiro. */
  fun maskPan(pan: String): String {
    if (pan.length < 11) return "*".repeat(pan.length)
    return pan.take(6) + "*".repeat(pan.length - 10) + pan.takeLast(4)
  }

  /**
   * Hex da resposta do cartão para o diagnóstico. Estrutura (tag + comprimento) sempre
   * visível; valor primitivo em claro só se a tag estiver em [EmvTags.DIAGNOSTIC_CLEAR],
   * senão `**` por byte. Resposta que não é TLV válido aparece só como tamanho: sem
   * estrutura não há como garantir que o conteúdo não é sensível.
   */
  fun maskResponseData(data: ByteArray): String {
    if (data.isEmpty()) return ""
    val tlvs = try {
      TlvParser.parse(data)
    } catch (_: EmvException) {
      return "<${data.size} bytes não interpretados>"
    }
    return try {
      buildString { tlvs.forEach { render(it, this) } }
    } finally {
      tlvs.forEach(Tlv::wipe) // RN-26: a cópia decodificada aqui também tinha dado do cartão.
    }
  }

  private fun render(tlv: Tlv, out: StringBuilder) {
    out.append(tlv.header.toHex())
    when {
      tlv.isConstructed -> tlv.children.forEach { render(it, out) }
      tlv.tag in EmvTags.DIAGNOSTIC_CLEAR -> out.append(tlv.value.toHex())
      else -> repeat(tlv.value.size) { out.append(MASK_BYTE) }
    }
  }
}
