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
   * Hex da resposta do cartão com o valor das tags sensíveis substituído por `**`
   * em cada byte. Se a resposta não for TLV válido, nada é exibido além do tamanho:
   * sem estrutura não há como garantir que o conteúdo não é sensível.
   */
  fun maskResponseData(data: ByteArray): String {
    if (data.isEmpty()) return ""
    val tlvs = try {
      TlvParser.parse(data)
    } catch (_: EmvException) {
      return "<${data.size} bytes não interpretados>"
    }
    return buildString { tlvs.forEach { render(it, this) } }
  }

  private fun render(tlv: Tlv, out: StringBuilder) {
    out.append(tlv.header.toHex())
    when {
      tlv.tag in EmvTags.SENSITIVE -> repeat(tlv.value.size) { out.append(MASK_BYTE) }
      tlv.isConstructed -> tlv.children.forEach { render(it, out) }
      else -> out.append(tlv.value.toHex())
    }
  }
}
