package com.cashtap.emv

/**
 * Falhas do diálogo com o cartão. Os nomes são os códigos do catálogo de erros
 * do SDK (`src/errors.ts`) e atravessam a ponte como código da Promise rejeitada.
 */
enum class EmvError {
  CARD_REMOVED,
  UNSUPPORTED_BRAND,
  PROTOCOL_ERROR,
  PARSE_ERROR,
  INCOMPLETE_DATA,
  CANCELLED_BY_USER,
  UNKNOWN,
}

/** `detail` é informação técnica e nunca contém dado sensível do cartão. */
class EmvException(
  val error: EmvError,
  val detail: String,
  cause: Throwable? = null,
) : Exception("$error: $detail", cause)
