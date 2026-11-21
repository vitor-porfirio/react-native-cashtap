package com.cashtap.emv

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ApduTest {
  @Test
  fun `E3-H1 - Lc é calculado a partir dos dados`() {
    val apdu = CommandApdu(0x00, 0xA4, 0x04, 0x00, "A0000000031010".hexToBytes(), le = 0x00)
    assertEquals("00A4040007A000000003101000", apdu.toBytes().toHex())
  }

  @Test
  fun `E3-H1 - sem dados, Lc é omitido`() {
    assertEquals("00B2010C00", CommandApdu(0x00, 0xB2, 0x01, 0x0C, le = 0x00).toBytes().toHex())
  }

  @Test
  fun `caso 1 - só cabeçalho, sem Lc nem Le`() {
    assertEquals("80CA9F36", CommandApdu(0x80, 0xCA, 0x9F, 0x36).toBytes().toHex())
  }

  @Test
  fun `caso 3 - dados sem Le`() {
    assertEquals("0020008004DEADBEEF", CommandApdu(0x00, 0x20, 0x00, 0x80, "DEADBEEF".hexToBytes()).toBytes().toHex())
  }

  @Test
  fun `RN-12 - SELECT PPSE confere com o Apêndice C`() {
    assertEquals(
      "00A404000E325041592E5359532E444446303100",
      Commands.selectByName(Commands.PPSE_NAME).toBytes().toHex(),
    )
  }

  @Test
  fun `RN-16 - GPO sem PDOL envia 83 00`() {
    assertEquals("80A8000002830000", Commands.getProcessingOptions(ByteArray(0)).toBytes().toHex())
  }

  @Test
  fun `RN-16 - GPO encapsula os dados do PDOL na tag 83`() {
    assertEquals("80A80000048302ABCD00", Commands.getProcessingOptions("ABCD".hexToBytes()).toBytes().toHex())
  }

  @Test
  fun `PDOL de 128 bytes ou mais usa comprimento BER longo 81 xx`() {
    val data = ByteArray(130) { 0x11 }
    val hex = Commands.getProcessingOptions(data).toBytes().toHex()
    assertTrue(hex.startsWith("80A80000" + "85" + "838182"))
    assertEquals(4 + 1 + 3 + 130 + 1, hex.length / 2)
  }

  @Test
  fun `PDOL de 127 bytes ainda usa a forma curta`() {
    assertTrue(Commands.getProcessingOptions(ByteArray(127)).toBytes().toHex().startsWith("80A8000081837F"))
  }

  @Test(expected = IllegalArgumentException::class)
  fun `PDOL acima de 252 bytes não cabe em APDU curto`() {
    Commands.getProcessingOptions(ByteArray(253))
  }

  @Test
  fun `E3-H5 - READ RECORD usa P2 = (SFI shl 3) or 4`() {
    assertEquals("00B2010C00", Commands.readRecord(sfi = 1, record = 1).toBytes().toHex())
    assertEquals("00B2031400", Commands.readRecord(sfi = 2, record = 3).toBytes().toHex())
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejeita byte de cabeçalho fora da faixa`() {
    CommandApdu(0x100, 0xA4, 0, 0)
  }

  @Test
  fun `resposta separa dados e status word`() {
    val response = ResponseApdu("6F02840F9000".hexToBytes())
    assertArrayEquals("6F02840F".hexToBytes(), response.data)
    assertEquals(0x90, response.sw1)
    assertEquals(0x00, response.sw2)
    assertTrue(response.isSuccess)
  }

  @Test
  fun `RN-15 - só 9000 é sucesso`() {
    assertFalse(ResponseApdu("6A82".hexToBytes()).isSuccess)
    assertFalse(ResponseApdu("6283".hexToBytes()).isSuccess)
    assertEquals("6A82", ResponseApdu("6A82".hexToBytes()).swHex)
  }

  @Test
  fun `RN-14 - resposta com menos de 2 bytes é PROTOCOL_ERROR`() {
    listOf("", "90").forEach { hex ->
      try {
        ResponseApdu(hex.hexToBytes())
        fail("deveria rejeitar '$hex'")
      } catch (e: EmvException) {
        assertEquals(EmvError.PROTOCOL_ERROR, e.error)
      }
    }
  }
}
