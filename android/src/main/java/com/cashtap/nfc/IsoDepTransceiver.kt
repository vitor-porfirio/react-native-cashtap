package com.cashtap.nfc

import android.nfc.TagLostException
import android.nfc.tech.IsoDep
import com.cashtap.emv.LinkLostException
import com.cashtap.emv.Transceiver
import java.io.Closeable
import java.io.IOException

/**
 * Canal ISO-DEP (ISO 14443-4) com o cartão. Bloqueia: nunca chamar na main thread.
 * Perda do cartão durante a troca vira [LinkLostException] (RN-07), nunca exceção crua.
 */
class IsoDepTransceiver(
  private val isoDep: IsoDep,
  private val timeoutMs: Int = DEFAULT_TIMEOUT_MS,
) : Transceiver, Closeable {

  fun connect() {
    try {
      if (!isoDep.isConnected) isoDep.connect()
      isoDep.timeout = timeoutMs
    } catch (e: IOException) {
      throw LinkLostException(e)
    } catch (e: SecurityException) {
      // Tag já descartada pelo sistema (cartão saiu antes da conexão).
      throw LinkLostException(e)
    }
  }

  override fun transceive(command: ByteArray): ByteArray = try {
    isoDep.transceive(command)
  } catch (e: TagLostException) {
    throw LinkLostException(e)
  } catch (e: IOException) {
    throw LinkLostException(e)
  } catch (e: IllegalStateException) {
    // transceive após close/desconexão.
    throw LinkLostException(e)
  }

  /** RN-11: chamado em `finally` por quem abriu o canal. */
  override fun close() {
    runCatching { isoDep.close() }
  }

  companion object {
    /** GPO de cartões qVSDC pode passar de 1 s em aparelhos lentos. */
    const val DEFAULT_TIMEOUT_MS = 5_000
  }
}
