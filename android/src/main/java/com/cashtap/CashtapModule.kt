package com.cashtap

import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.Settings
import com.cashtap.nfc.NfcStateMonitor
import com.cashtap.nfc.NfcStatus
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext

class CashtapModule(reactContext: ReactApplicationContext) :
  NativeCashtapSpec(reactContext) {

  private val nfcStateMonitor = NfcStateMonitor(reactContext) { status ->
    emitOnNfcStatusChange(status.name)
  }

  init {
    nfcStateMonitor.start()
  }

  override fun getNfcStatus(promise: Promise) {
    promise.resolve(NfcStatus.of(reactApplicationContext).name)
  }

  /** RN-02: leva o operador à tela de NFC; cai para a de conexões se o aparelho não tiver uma. */
  override fun openNfcSettings() {
    val activity = reactApplicationContext.currentActivity
    val launch = { action: String ->
      val intent = Intent(action)
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        reactApplicationContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }
    try {
      launch(Settings.ACTION_NFC_SETTINGS)
    } catch (_: ActivityNotFoundException) {
      try {
        launch(Settings.ACTION_WIRELESS_SETTINGS)
      } catch (e: RuntimeException) {
        AndroidLogger.warn("nenhuma tela de configurações de NFC disponível: ${e.javaClass.simpleName}")
      }
    } catch (e: RuntimeException) {
      // Alguns fabricantes protegem a tela com SecurityException; nunca derrubar o app por isso.
      AndroidLogger.warn("não foi possível abrir as configurações de NFC: ${e.javaClass.simpleName}")
    }
  }

  override fun invalidate() {
    nfcStateMonitor.stop()
    super.invalidate()
  }

  companion object {
    const val NAME = NativeCashtapSpec.NAME
  }
}
