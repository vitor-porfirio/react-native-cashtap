package com.cashtap.emv

/**
 * Cartão simulado: responde por correspondência exata do comando ou por prefixo
 * (o GPO carrega data e número imprevisível, que mudam a cada execução).
 * Comando sem regra responde 6A82, como um cartão real responderia a um SELECT desconhecido.
 */
class FakeTransceiver : Transceiver {
  private val rules = mutableListOf<Pair<(String) -> Boolean, String>>()
  val sent = mutableListOf<String>()
  var loseLinkOnCall: Int? = null

  fun on(command: CommandApdu, response: String) = apply {
    val hex = command.toBytes().toHex()
    rules += { cmd: String -> cmd == hex } to response
  }

  fun onPrefix(prefix: String, response: String) = apply {
    rules += { cmd: String -> cmd.startsWith(prefix) } to response
  }

  override fun transceive(command: ByteArray): ByteArray {
    val hex = command.toHex()
    sent += hex
    if (loseLinkOnCall == sent.size) throw LinkLostException()
    val response = rules.lastOrNull { it.first(hex) }?.second ?: "6A82"
    return response.hexToBytes()
  }

  companion object {
    fun visa() = FakeTransceiver()
      .on(Commands.selectByName(Commands.PPSE_NAME), Fixtures.VISA_PPSE + Fixtures.OK)
      .on(Commands.selectByName(Fixtures.VISA_AID.hexToBytes()), Fixtures.VISA_SELECT + Fixtures.OK)
      .onPrefix("80A80000", Fixtures.VISA_GPO + Fixtures.OK)
      .on(Commands.readRecord(1, 1), Fixtures.VISA_RECORD_1_1 + Fixtures.OK)

    fun mastercard() = FakeTransceiver()
      .on(Commands.selectByName(Commands.PPSE_NAME), Fixtures.MASTERCARD_PPSE + Fixtures.OK)
      .on(Commands.selectByName(Fixtures.MASTERCARD_AID.hexToBytes()), Fixtures.MASTERCARD_SELECT + Fixtures.OK)
      .on(Commands.getProcessingOptions(ByteArray(0)), Fixtures.MASTERCARD_GPO + Fixtures.OK)
      .on(Commands.readRecord(1, 1), Fixtures.MASTERCARD_RECORD_1_1 + Fixtures.OK)
      .on(Commands.readRecord(2, 1), Fixtures.MASTERCARD_RECORD_2_1 + Fixtures.OK)
      .on(Commands.readRecord(2, 2), "6A83")
      .on(Commands.readRecord(2, 3), Fixtures.MASTERCARD_RECORD_2_3 + Fixtures.OK)
  }
}

/** Relógio que avança 5 ms a cada leitura monotônica. */
class FakeClock(private val wallMillis: Long = 1_795_000_000_000L) : Clock {
  private var nanos = 0L

  override fun monotonicNanos(): Long {
    nanos += 5_000_000L
    return nanos
  }

  override fun currentTimeMillis(): Long = wallMillis
}

class RecordingLogger : Logger {
  val lines = mutableListOf<String>()

  override fun debug(message: String) {
    lines += message
  }

  override fun warn(message: String) {
    lines += message
  }
}
