package com.cashtap.nfc

import android.content.Context
import android.nfc.NfcAdapter

/** Disponibilidade do NFC. Os nomes são o contrato com o TS (`NFC_STATUSES`). */
enum class NfcStatus {
  UNSUPPORTED,
  DISABLED,
  READY;

  companion object {
    fun of(adapter: NfcAdapter?): NfcStatus = when {
      adapter == null -> UNSUPPORTED
      !adapter.isEnabled -> DISABLED
      else -> READY
    }

    fun of(context: Context): NfcStatus = of(NfcAdapter.getDefaultAdapter(context))
  }
}
