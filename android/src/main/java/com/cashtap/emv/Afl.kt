package com.cashtap.emv

/**
 * Entrada do Application File Locator (tag 94), em grupos de 4 bytes:
 * SFI (5 bits altos do 1º byte), primeiro registro, último registro e
 * quantos registros participam da autenticação offline.
 */
data class AflEntry(
  val sfi: Int,
  val firstRecord: Int,
  val lastRecord: Int,
  val offlineAuthRecords: Int,
)

/** Par (SFI, registro) a ser lido com READ RECORD. */
data class RecordLocation(val sfi: Int, val record: Int)

object Afl {
  fun parse(bytes: ByteArray): List<AflEntry> {
    if (bytes.size % 4 != 0) {
      throw EmvException(EmvError.PARSE_ERROR, "AFL com ${bytes.size} bytes, esperado múltiplo de 4")
    }
    return (bytes.indices step 4).map { offset ->
      val entry = AflEntry(
        sfi = bytes.u8(offset) ushr 3,
        firstRecord = bytes.u8(offset + 1),
        lastRecord = bytes.u8(offset + 2),
        offlineAuthRecords = bytes.u8(offset + 3),
      )
      if (entry.sfi !in 1..30 || entry.firstRecord < 1 || entry.lastRecord < entry.firstRecord) {
        throw EmvException(EmvError.PARSE_ERROR, "entrada de AFL inválida: $entry")
      }
      entry
    }
  }

  /** RN-17: lê exatamente os registros indicados, sem varredura. */
  fun records(entries: List<AflEntry>): List<RecordLocation> =
    entries.flatMap { entry -> (entry.firstRecord..entry.lastRecord).map { RecordLocation(entry.sfi, it) } }
}
