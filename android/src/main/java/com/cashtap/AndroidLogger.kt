package com.cashtap

import android.util.Log
import com.cashtap.emv.Logger

/** Único ponto do SDK que escreve no logcat (tag `CashTap`). */
object AndroidLogger : Logger {
  private const val TAG = "CashTap"

  override fun debug(message: String) {
    if (Log.isLoggable(TAG, Log.DEBUG) || BuildConfig.DEBUG) Log.d(TAG, message)
  }

  override fun warn(message: String) {
    Log.w(TAG, message)
  }
}
