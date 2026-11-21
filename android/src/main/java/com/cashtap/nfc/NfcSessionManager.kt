package com.cashtap.nfc

import android.nfc.NfcAdapter
import android.nfc.Tag
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Ciclo de vida do reader mode (E2-H2).
 * - Liga na Activity em primeiro plano, obtida no momento do uso (nunca retida).
 * - Desliga em `onHostPause` e religa em `onHostResume` se a sessão ainda estiver ativa.
 * - Guarda a última tag detectada para o `readCard` usar.
 */
class NfcSessionManager(
  private val context: ReactApplicationContext,
  private val onTagDetected: () -> Unit,
) : LifecycleEventListener {

  /** Sessão pedida pelo JS (independe de a Activity estar visível agora). */
  private val active = AtomicBoolean(false)
  private val currentTag = AtomicReference<Tag?>(null)

  init {
    context.addLifecycleEventListener(this)
  }

  /** @throws NfcUnavailableException quando não há NFC, está desligado ou não há Activity. */
  fun start() {
    when (NfcStatus.of(context)) {
      NfcStatus.UNSUPPORTED -> throw NfcUnavailableException("NFC_UNSUPPORTED")
      NfcStatus.DISABLED -> throw NfcUnavailableException("NFC_DISABLED")
      NfcStatus.READY -> Unit
    }
    if (context.currentActivity == null) throw NfcUnavailableException("UNKNOWN", "nenhuma Activity em primeiro plano")
    currentTag.set(null)
    active.set(true)
    UiThreadUtil.runOnUiThread { enableOnCurrentActivity() }
  }

  /** RN-11: idempotente; pode ser chamado em qualquer estado. */
  fun stop() {
    active.set(false)
    currentTag.set(null)
    UiThreadUtil.runOnUiThread { disableOnCurrentActivity() }
  }

  /** Entrega a tag detectada uma única vez: a próxima leitura exige nova aproximação. */
  fun takeTag(): Tag? = currentTag.getAndSet(null)

  fun destroy() {
    stop()
    context.removeLifecycleEventListener(this)
  }

  override fun onHostResume() {
    if (active.get()) enableOnCurrentActivity()
  }

  override fun onHostPause() {
    // Mantém `active`: a sessão volta a escutar quando o app voltar ao primeiro plano.
    disableOnCurrentActivity()
  }

  override fun onHostDestroy() {
    disableOnCurrentActivity()
  }

  private fun enableOnCurrentActivity() {
    val activity = context.currentActivity ?: return
    val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return
    adapter.enableReaderMode(
      activity,
      { tag ->
        // Thread de binder: só guarda a tag e avisa; a leitura roda no executor do módulo.
        if (active.get()) {
          currentTag.set(tag)
          onTagDetected()
        }
      },
      READER_FLAGS,
      null,
    )
  }

  private fun disableOnCurrentActivity() {
    val activity = context.currentActivity ?: return
    val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return
    runCatching { adapter.disableReaderMode(activity) }
  }

  companion object {
    /**
     * Tipos A e B (cartões EMV são ISO 14443 A ou B), sem checagem NDEF — cartão de
     * pagamento não carrega NDEF — e sem o som do sistema, já que o SDK dá o próprio feedback.
     */
    const val READER_FLAGS = NfcAdapter.FLAG_READER_NFC_A or
      NfcAdapter.FLAG_READER_NFC_B or
      NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or
      NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS
  }
}

class NfcUnavailableException(val code: String, detail: String = code) : Exception(detail)
