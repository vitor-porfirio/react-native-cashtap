package com.cashtap.emv

import java.io.ByteArrayOutputStream

/**
 * C-APDU curto (ISO 7816-4): `CLA INS P1 P2 [Lc Data] [Le]`.
 * Lc é calculado a partir de `data` e omitido quando não há dados.
 * `le = 0x00` pede "até 256 bytes", que é o usual em EMV.
 */
class CommandApdu(
  val cla: Int,
  val ins: Int,
  val p1: Int,
  val p2: Int,
  val data: ByteArray = ByteArray(0),
  val le: Int? = null,
) {
  init {
    listOf(cla, ins, p1, p2).forEach { require(it in 0..0xFF) { "byte de cabeçalho fora da faixa: $it" } }
    require(data.size <= 255) { "dados excedem APDU curto: ${data.size} bytes" }
    le?.let { require(it in 0..0xFF) { "Le fora da faixa: $it" } }
  }

  fun toBytes(): ByteArray {
    val out = ByteArrayOutputStream(5 + data.size + 1)
    out.write(cla)
    out.write(ins)
    out.write(p1)
    out.write(p2)
    if (data.isNotEmpty()) {
      out.write(data.size)
      out.write(data)
    }
    le?.let { out.write(it) }
    return out.toByteArray()
  }

  fun withLe(newLe: Int) = CommandApdu(cla, ins, p1, p2, data, newLe)
}

/** R-APDU: dados + SW1 SW2. */
class ResponseApdu(bytes: ByteArray) {
  val data: ByteArray
  val sw1: Int
  val sw2: Int

  init {
    // RN-14: toda resposta precisa ter ao menos SW1 SW2.
    if (bytes.size < 2) {
      throw EmvException(EmvError.PROTOCOL_ERROR, "resposta com ${bytes.size} byte(s), esperado >= 2")
    }
    data = bytes.copyOfRange(0, bytes.size - 2)
    sw1 = bytes.u8(bytes.size - 2)
    sw2 = bytes.u8(bytes.size - 1)
  }

  val sw: Int get() = (sw1 shl 8) or sw2

  /** RN-15: só 9000 é sucesso de etapa. */
  val isSuccess: Boolean get() = sw == SW_SUCCESS

  val swHex: String get() = "%04X".format(sw)

  companion object {
    const val SW_SUCCESS = 0x9000
    const val SW_FILE_NOT_FOUND = 0x6A82
    const val SW1_BYTES_AVAILABLE = 0x61
    const val SW1_WRONG_LE = 0x6C
  }
}

/** Comandos EMV usados no diálogo de leitura (TCC, Apêndice C). */
object Commands {
  val PPSE_NAME: ByteArray = "2PAY.SYS.DDF01".toByteArray(Charsets.US_ASCII)

  fun selectByName(name: ByteArray) = CommandApdu(0x00, 0xA4, 0x04, 0x00, name, le = 0x00)

  /** Maior PDOL que cabe em APDU curto: 255 − `83 81 xx`. */
  const val MAX_PDOL_DATA = 252

  /**
   * RN-16: dados do PDOL encapsulados na tag 83; sem PDOL vai `83 00`.
   * Comprimento BER: forma curta até 127 bytes, `81 xx` acima disso.
   */
  fun getProcessingOptions(pdolData: ByteArray): CommandApdu {
    require(pdolData.size <= MAX_PDOL_DATA) { "dados do PDOL excedem APDU curto: ${pdolData.size} bytes" }
    val length = if (pdolData.size < 0x80) {
      byteArrayOf(pdolData.size.toByte())
    } else {
      byteArrayOf(0x81.toByte(), pdolData.size.toByte())
    }
    val template = byteArrayOf(0x83.toByte()) + length + pdolData
    return CommandApdu(0x80, 0xA8, 0x00, 0x00, template, le = 0x00)
  }

  /** P2 = (SFI << 3) | 4: "P1 é número de registro" (E3-H5). */
  fun readRecord(sfi: Int, record: Int): CommandApdu {
    require(sfi in 1..30) { "SFI fora da faixa: $sfi" }
    return CommandApdu(0x00, 0xB2, record, (sfi shl 3) or 0x04, le = 0x00)
  }

  fun getResponse(length: Int) = CommandApdu(0x00, 0xC0, 0x00, 0x00, le = length)
}
