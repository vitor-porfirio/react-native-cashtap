package com.cashtap.emv

/** Tags EMV usadas pelo SDK (EMV Book 3, Anexo A). */
object EmvTags {
  // Seleção (FCI)
  const val FCI_TEMPLATE = 0x6F
  const val DF_NAME = 0x84
  const val FCI_PROPRIETARY = 0xA5
  const val FCI_ISSUER_DISCRETIONARY = 0xBF0C
  const val DIRECTORY_ENTRY = 0x61
  const val AID = 0x4F
  const val APPLICATION_LABEL = 0x50
  const val PRIORITY_INDICATOR = 0x87
  const val PDOL = 0x9F38

  // GET PROCESSING OPTIONS
  const val RESPONSE_FORMAT_1 = 0x80
  const val RESPONSE_FORMAT_2 = 0x77
  const val AIP = 0x82
  const val AFL = 0x94

  // Registros
  const val RECORD_TEMPLATE = 0x70
  const val PAN = 0x5A
  const val TRACK2_EQUIVALENT = 0x57
  const val TRACK1 = 0x56
  const val EXPIRY_DATE = 0x5F24
  const val PAN_SEQUENCE_NUMBER = 0x5F34
  const val CARDHOLDER_NAME = 0x5F20
  const val TRACK1_DISCRETIONARY = 0x9F1F
  const val TRACK2_MASTERCARD = 0x9F6B
  const val APPLICATION_CRYPTOGRAM = 0x9F26
  const val ISSUER_APPLICATION_DATA = 0x9F10

  // Dados do terminal pedidos no PDOL
  const val AMOUNT_AUTHORISED = 0x9F02
  const val AMOUNT_OTHER = 0x9F03
  const val TERMINAL_COUNTRY_CODE = 0x9F1A
  const val TRANSACTION_CURRENCY_CODE = 0x5F2A
  const val TVR = 0x95
  const val TRANSACTION_DATE = 0x9A
  const val TRANSACTION_TYPE = 0x9C
  const val TRANSACTION_TIME = 0x9F21
  const val UNPREDICTABLE_NUMBER = 0x9F37
  const val TTQ = 0x9F66
  const val TERMINAL_TYPE = 0x9F35
  const val TERMINAL_CAPABILITIES = 0x9F33
  const val ADDITIONAL_TERMINAL_CAPABILITIES = 0x9F40
  const val MERCHANT_NAME_LOCATION = 0x9F4E

  const val ICC_PUBLIC_KEY_CERTIFICATE = 0x9F46
  const val ICC_PUBLIC_KEY_EXPONENT = 0x9F47
  const val ICC_PUBLIC_KEY_REMAINDER = 0x9F48
  const val SIGNED_DYNAMIC_APPLICATION_DATA = 0x9F4B
  const val PAYMENT_ACCOUNT_REFERENCE = 0x9F24

  /**
   * Allowlist do diagnóstico (RN-23, D016): só estas tags **primitivas** aparecem
   * em claro. Toda outra primitiva é mascarada — inclusive tags que o SDK não conhece.
   * Denylist não serve: o certificado do ICC (9F46), por exemplo, carrega o PAN
   * recuperável com chaves públicas.
   *
   * ATENÇÃO: incluir uma tag aqui exige revisão de segurança (Tech Lead) e registro
   * no DECISIONS.md. Na dúvida, não inclua: esquecer uma tag só esconde informação.
   */
  val DIAGNOSTIC_CLEAR: Set<Int> = setOf(
    DF_NAME, AID, APPLICATION_LABEL, PRIORITY_INDICATOR, PDOL,
    0x9F12, // nome preferido da aplicação
    0x5F2D, // preferência de idioma
    0x9F11, // índice da tabela de caracteres
    RESPONSE_FORMAT_1, AIP, AFL,
    EXPIRY_DATE, PAN_SEQUENCE_NUMBER,
    0x5F25, // data de início de validade
    0x5F28, // país do emissor
    0x9F07, // controle de uso da aplicação
    0x9F08, // versão da aplicação
    0x8C, 0x8D, // CDOL1, CDOL2
    0x8E, // lista de CVM
    0x9F0D, 0x9F0E, 0x9F0F, // IAC
    0x9F42, // moeda da aplicação
    0x9F36, // contador de transações (ATC)
    0x9F27, // dado de informação do criptograma (CID)
    0x9F6C, // CTQ
    0x8F, // índice da chave pública da CA
    0x9F4A, // lista de tags para SDA
  )

  /**
   * Tags com dado do portador ou que permitem reconstruí-lo. Documentação e testes:
   * nenhuma pode estar em [DIAGNOSTIC_CLEAR].
   */
  val SENSITIVE: Set<Int> = setOf(
    PAN,
    TRACK2_EQUIVALENT,
    TRACK1,
    TRACK2_MASTERCARD,
    CARDHOLDER_NAME,
    TRACK1_DISCRETIONARY,
    APPLICATION_CRYPTOGRAM,
    ISSUER_APPLICATION_DATA,
    ICC_PUBLIC_KEY_CERTIFICATE,
    ICC_PUBLIC_KEY_EXPONENT,
    ICC_PUBLIC_KEY_REMAINDER,
    SIGNED_DYNAMIC_APPLICATION_DATA,
    PAYMENT_ACCOUNT_REFERENCE,
  )

  /** Formato numérico (n): preenchimento à esquerda com zeros (EMV Book 3, 5.4). */
  val NUMERIC: Set<Int> = setOf(
    AMOUNT_AUTHORISED,
    AMOUNT_OTHER,
    TERMINAL_COUNTRY_CODE,
    TRANSACTION_CURRENCY_CODE,
    TRANSACTION_DATE,
    TRANSACTION_TYPE,
    TRANSACTION_TIME,
    TERMINAL_TYPE,
  )
}
