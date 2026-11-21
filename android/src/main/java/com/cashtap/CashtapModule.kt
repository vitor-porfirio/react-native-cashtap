package com.cashtap

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.nfc.NfcAdapter
import android.os.Build
import android.provider.Settings
import com.cashtap.nfc.NfcStatus
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext

class CashtapModule(reactContext: ReactApplicationContext) :
  NativeCashtapSpec(reactContext) {

  private val nfcStateReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == NfcAdapter.ACTION_ADAPTER_STATE_CHANGED) {
        emitOnNfcStatusChange(NfcStatus.of(context).name)
      }
    }
  }

  init {
    val filter = IntentFilter(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(nfcStateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      reactContext.registerReceiver(nfcStateReceiver, filter)
    }
  }

  override fun getNfcStatus(promise: Promise) {
    promise.resolve(NfcStatus.of(reactApplicationContext).name)
  }

  override fun openNfcSettings() {
    val context = reactApplicationContext
    val intent = Intent(Settings.ACTION_NFC_SETTINGS)
      .takeIf { it.resolveActivity(context.packageManager) != null }
      ?: Intent(Settings.ACTION_WIRELESS_SETTINGS)
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  override fun invalidate() {
    runCatching { reactApplicationContext.unregisterReceiver(nfcStateReceiver) }
    super.invalidate()
  }

  companion object {
    const val NAME = NativeCashtapSpec.NAME
  }
}
