package com.cashtap.emv

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class HexTest {
  @Test
  fun `codifica bytes acima de 0x7F sem sinal negativo`() {
    assertEquals("009F7F80FF", byteArrayOf(0x00, 0x9F.toByte(), 0x7F, 0x80.toByte(), 0xFF.toByte()).toHex())
  }

  @Test
  fun `ida e volta preserva todos os 256 valores`() {
    val all = ByteArray(256) { it.toByte() }
    assertArrayEquals(all, all.toHex().hexToBytes())
  }

  @Test
  fun `aceita minúsculas e espaços`() {
    assertArrayEquals(byteArrayOf(0x9F.toByte(), 0x38), "9f 38".hexToBytes())
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejeita número ímpar de dígitos`() {
    "ABC".hexToBytes()
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejeita caractere não hexadecimal`() {
    "9G".hexToBytes()
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejeita dígito não ASCII que Character digit aceitaria`() {
    "\u0663\u0663".hexToBytes() // dígito árabe-índico
  }

  @Test
  fun `array vazio vira string vazia`() {
    assertEquals("", ByteArray(0).toHex())
  }
}
