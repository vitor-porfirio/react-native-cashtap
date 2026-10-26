package com.cashtap

import com.facebook.react.bridge.ReactApplicationContext

class CashtapModule(reactContext: ReactApplicationContext) :
  NativeCashtapSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeCashtapSpec.NAME
  }
}
