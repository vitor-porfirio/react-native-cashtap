package com.cashtap.emv

/** Log do SDK. Nunca recebe dado sensível em claro (security.md, RN-23). */
interface Logger {
  fun debug(message: String)

  fun warn(message: String)

  object None : Logger {
    override fun debug(message: String) = Unit

    override fun warn(message: String) = Unit
  }
}
