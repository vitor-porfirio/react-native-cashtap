package com.cashtap.emv

/**
 * Canal de troca de APDUs com o cartão. A implementação real é o
 * `IsoDepTransceiver`; nos testes, um fake com respostas gravadas.
 */
fun interface Transceiver {
  /** @throws LinkLostException quando o cartão sai do campo durante a troca. */
  fun transceive(command: ByteArray): ByteArray
}

class LinkLostException(cause: Throwable? = null) :
  Exception("link com o cartão perdido", cause)

/** Relógio injetável: monotônico para medir etapas, de parede para a data da transação. */
interface Clock {
  fun monotonicNanos(): Long

  fun currentTimeMillis(): Long

  object System : Clock {
    override fun monotonicNanos(): Long = java.lang.System.nanoTime()

    override fun currentTimeMillis(): Long = java.lang.System.currentTimeMillis()
  }
}
