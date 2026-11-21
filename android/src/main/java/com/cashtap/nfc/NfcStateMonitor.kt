package com.cashtap.nfc

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.nfc.NfcAdapter
import android.os.Build

/**
 * Observa o NFC ser ligado ou desligado nas configurações e avisa só quando o
 * status de fato muda (RN-02: a UI reverifica sem ação extra do operador).
 */
class NfcStateMonitor(
  private val context: Context,
  private val onChange: (NfcStatus) -> Unit,
) {
  @Volatile private var lastStatus: NfcStatus? = null
  @Volatile private var registered = false

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action != NfcAdapter.ACTION_ADAPTER_STATE_CHANGED) return
      // TURNING_ON / TURNING_OFF são transitórios: só ON e OFF mudam o status.
      val status = when (intent.getIntExtra(NfcAdapter.EXTRA_ADAPTER_STATE, -1)) {
        NfcAdapter.STATE_ON -> NfcStatus.READY
        NfcAdapter.STATE_OFF -> NfcStatus.DISABLED
        else -> return
      }
      if (status != lastStatus) {
        lastStatus = status
        onChange(status)
      }
    }
  }

  @Synchronized
  fun start() {
    if (registered) return
    lastStatus = NfcStatus.of(context)
    val filter = IntentFilter(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      // O broadcast vem do serviço NFC (UID nfc), não do system_server: com
      // RECEIVER_NOT_EXPORTED ele não seria entregue. É seguro exportar porque
      // ADAPTER_STATE_CHANGED é protected-broadcast — nenhum app consegue forjá-lo.
      context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
    registered = true
  }

  @Synchronized
  fun stop() {
    if (!registered) return
    runCatching { context.unregisterReceiver(receiver) }
    registered = false
  }
}
