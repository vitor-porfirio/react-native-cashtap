package com.cashtap.emv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class AflAndAidTest {
  @Test
  fun `E3-H5 - AFL vira a lista de pares SFI e registro`() {
    val entries = Afl.parse("08010100" .plus("10010300").hexToBytes())
    assertEquals(listOf(AflEntry(1, 1, 1, 0), AflEntry(2, 1, 3, 0)), entries)
    assertEquals(
      listOf(RecordLocation(1, 1), RecordLocation(2, 1), RecordLocation(2, 2), RecordLocation(2, 3)),
      Afl.records(entries),
    )
  }

  @Test
  fun `RN-17 - lê só o que o AFL indica`() {
    assertEquals(1, Afl.records(Afl.parse("18020201".hexToBytes())).size)
  }

  @Test
  fun `AFL com tamanho fora de múltiplo de 4 é PARSE_ERROR`() {
    assertAflError("080101")
  }

  @Test
  fun `AFL com registro final antes do inicial é PARSE_ERROR`() {
    assertAflError("08030100")
  }

  @Test
  fun `AFL com SFI zero é PARSE_ERROR`() {
    assertAflError("00010100")
  }

  @Test
  fun `RN-20 - bandeira inferida pelo RID do AID`() {
    assertEquals(CardBrand.VISA, AidRegistry.brandOf("A0000000031010".hexToBytes()))
    assertEquals(CardBrand.VISA, AidRegistry.brandOf("A0000000032010".hexToBytes()))
    assertEquals(CardBrand.MASTERCARD, AidRegistry.brandOf("A0000000041010".hexToBytes()))
    assertEquals(CardBrand.MASTERCARD, AidRegistry.brandOf("A0000000043060".hexToBytes()))
  }

  @Test
  fun `RN-13 - AID fora do registro não tem bandeira`() {
    assertNull(AidRegistry.brandOf("A0000001523010".hexToBytes())) // Discover
    assertNull(AidRegistry.brandOf("A0000004941010".hexToBytes())) // Elo
    assertNull(AidRegistry.brandOf("A00000".hexToBytes()))
  }

  @Test
  fun `wireName é o contrato com o TS`() {
    assertEquals("visa", CardBrand.VISA.wireName)
    assertEquals("mastercard", CardBrand.MASTERCARD.wireName)
  }

  private fun assertAflError(hex: String) {
    try {
      Afl.parse(hex.hexToBytes())
      fail("deveria rejeitar $hex")
    } catch (e: EmvException) {
      assertEquals(EmvError.PARSE_ERROR, e.error)
    }
  }
}
