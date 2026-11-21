package com.cashtap.emv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class TlvParserTest {
  /** Resposta de PPSE codificada à mão (comprimentos conferidos byte a byte, validável no emvlab.org). */
  private val ppseLiteral =
    "6F23840E325041592E5359532E4444463031A511BF0C0E610C4F07A0000000031010870101"

  @Test
  fun `E4-H1 - tags de 1 byte`() {
    val tlvs = TlvParser.parse("5A084111111111111111".hexToBytes())
    assertEquals(1, tlvs.size)
    assertEquals(0x5A, tlvs[0].tag)
    assertEquals("4111111111111111", tlvs[0].value.toHex())
  }

  @Test
  fun `E4-H1 - tags de múltiplos bytes`() {
    val tlvs = TlvParser.parse("9F38039F66045F2403251231".hexToBytes())
    assertEquals(listOf(0x9F38, 0x5F24), tlvs.map { it.tag })
    assertEquals("9F6604", tlvs[0].value.toHex())
  }

  @Test
  fun `E4-H1 - comprimento longo 81`() {
    val value = "AB".repeat(200)
    val tlvs = TlvParser.parse(("5081C8$value").hexToBytes())
    assertEquals(200, tlvs.single().value.size)
  }

  @Test
  fun `E4-H1 - comprimento longo 82`() {
    val value = "CD".repeat(300)
    val tlvs = TlvParser.parse(("5082012C$value").hexToBytes())
    assertEquals(300, tlvs.single().value.size)
  }

  @Test
  fun `E4-H1 - vetor literal de PPSE com aninhamento em 4 níveis`() {
    val tlvs = TlvParser.parse(ppseLiteral.hexToBytes())
    val root = tlvs.single()
    assertEquals(0x6F, root.tag)
    assertTrue(root.isConstructed)
    assertEquals("2PAY.SYS.DDF01", String(root.find(0x84)!!.value, Charsets.US_ASCII))
    assertEquals("A0000000031010", tlvs.find(0x4F)!!.value.toHex())
    assertEquals("01", tlvs.find(0x87)!!.value.toHex())
    assertNotNull(tlvs.find(0xBF0C))
  }

  @Test
  fun `E4-H1 - busca encontra tag aninhada em qualquer profundidade`() {
    val tlvs = TlvParser.parse(Fixtures.VISA_SELECT.hexToBytes())
    assertEquals(Fixtures.VISA_PDOL, tlvs.find(EmvTags.PDOL)!!.value.toHex())
    assertNull(tlvs.find(0x5A))
  }

  @Test
  fun `findAll devolve todas as entradas de diretório`() {
    val twoApps = Fixtures.c(
      "6F",
      Fixtures.c("A5", Fixtures.c("BF0C", Fixtures.c("61", Fixtures.p("4F", "A0000000041010")), Fixtures.c("61", Fixtures.p("4F", "A0000000031010")))),
    )
    assertEquals(2, TlvParser.parse(twoApps.hexToBytes()).findAll(0x61).size)
  }

  @Test
  fun `objeto primitivo não tem filhos`() {
    val tlv = TlvParser.parse("5A084111111111111111".hexToBytes()).single()
    assertFalse(tlv.isConstructed)
    assertTrue(tlv.children.isEmpty())
  }

  @Test
  fun `bytes 00 e FF de preenchimento entre objetos são ignorados`() {
    val tlvs = TlvParser.parse("00009F360200010000FF5F340101".hexToBytes())
    assertEquals(listOf(0x9F36, 0x5F34), tlvs.map { it.tag })
  }

  @Test
  fun `header preserva os bytes originais de tag e comprimento`() {
    val tlv = TlvParser.parse("5081C8${"00".repeat(200)}".hexToBytes()).single()
    assertEquals("5081C8", tlv.header.toHex())
  }

  @Test
  fun `E4-H1 - entrada truncada falha de forma controlada`() {
    listOf(
      "5A08411111", // valor menor que o comprimento declarado
      "9F", // tag multi-byte sem continuação
      "5A", // comprimento ausente
      "5A81", // comprimento longo truncado
      "6F055A08411111", // filho maior que o pai
    ).forEach(::assertParseError)
  }

  @Test
  fun `forma de comprimento indefinida ou exagerada é rejeitada`() {
    assertParseError("5A80")
    assertParseError("5A840000000100")
  }

  @Test
  fun `tag com mais de 3 bytes é rejeitada`() {
    assertParseError("9F8181810100")
  }

  @Test
  fun `RN-23 - mensagem de erro não repete bytes do cartão`() {
    // Parse desalinhado dentro de um PAN: "tag" e "comprimento" seriam dígitos do número.
    try {
      TlvParser.parse("5A015483133300".hexToBytes())
      fail()
    } catch (e: EmvException) {
      assertFalse(e.detail.contains("83"))
      assertFalse(e.detail.contains("13"))
      assertFalse(e.detail.contains("33"))
    }
  }

  @Test
  fun `wipe zera valor e cabeçalho recursivamente`() {
    val tlvs = TlvParser.parse(Fixtures.VISA_GPO.hexToBytes())
    tlvs.forEach(Tlv::wipe)
    fun check(t: Tlv) {
      assertTrue(t.value.all { it == 0.toByte() })
      assertTrue(t.header.all { it == 0.toByte() })
      t.children.forEach(::check)
    }
    tlvs.forEach(::check)
  }

  @Test
  fun `DOL é lido como pares tag e comprimento`() {
    val dol = TlvParser.parseDol(Fixtures.VISA_PDOL.hexToBytes())
    assertEquals(
      listOf(
        DolEntry(0x9F66, 4), DolEntry(0x9F02, 6), DolEntry(0x9F03, 6), DolEntry(0x9F1A, 2),
        DolEntry(0x95, 5), DolEntry(0x5F2A, 2), DolEntry(0x9A, 3), DolEntry(0x9C, 1), DolEntry(0x9F37, 4),
      ),
      dol,
    )
  }

  @Test
  fun `DOL truncado é PARSE_ERROR`() {
    try {
      TlvParser.parseDol("9F66".hexToBytes())
      fail()
    } catch (e: EmvException) {
      assertEquals(EmvError.PARSE_ERROR, e.error)
    }
  }

  private fun assertParseError(hex: String) {
    try {
      TlvParser.parse(hex.hexToBytes())
      fail("deveria rejeitar $hex")
    } catch (e: EmvException) {
      assertEquals("entrada $hex", EmvError.PARSE_ERROR, e.error)
    }
  }
}
