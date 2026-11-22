/**
 * Catálogo de erros (especificação §5). Toda mensagem ao operador mora aqui,
 * nunca espalhada pelo código, para permitir revisão de texto e i18n.
 */
export const ERROR_CODES = [
  'NFC_UNSUPPORTED',
  'NFC_DISABLED',
  'INVALID_AMOUNT',
  'ALREADY_RUNNING',
  'CARD_REMOVED',
  'UNSUPPORTED_BRAND',
  'PROTOCOL_ERROR',
  'PARSE_ERROR',
  'INCOMPLETE_DATA',
  'READ_FAILED_MAX_RETRIES',
  'TIMEOUT',
  'CANCELLED_BY_USER',
  'UNKNOWN',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Erro classificado. `message` é para o operador (pt-BR); `detail` é técnico
 * e nunca contém dado sensível do cartão.
 */
export type CashTapError = {
  code: ErrorCode;
  message: string;
  detail?: string;
  /** Se uma nova tentativa (automática ou do operador) pode dar certo. */
  recoverable: boolean;
};

type CatalogEntry = { message: string; recoverable: boolean };

const CATALOG: Record<ErrorCode, CatalogEntry> = {
  NFC_UNSUPPORTED: {
    message:
      'Este aparelho não possui NFC e não pode receber pagamentos por aproximação.',
    recoverable: false,
  },
  NFC_DISABLED: {
    message:
      'O NFC está desligado. Ative-o nas configurações do aparelho para continuar.',
    recoverable: true,
  },
  INVALID_AMOUNT: {
    message: 'Valor de cobrança inválido.',
    recoverable: false,
  },
  ALREADY_RUNNING: {
    message: 'Já existe uma cobrança em andamento.',
    recoverable: false,
  },
  CARD_REMOVED: {
    message:
      'O cartão foi afastado antes da leitura terminar. Aproxime novamente.',
    recoverable: true,
  },
  UNSUPPORTED_BRAND: {
    message: 'Este cartão não é aceito. Tente um cartão Visa ou Mastercard.',
    recoverable: false,
  },
  PROTOCOL_ERROR: {
    message: 'Não foi possível se comunicar com o cartão. Tente novamente.',
    recoverable: true,
  },
  PARSE_ERROR: {
    message: 'A resposta do cartão não pôde ser interpretada.',
    recoverable: true,
  },
  INCOMPLETE_DATA: {
    message: 'Não foi possível obter todos os dados do cartão.',
    recoverable: false,
  },
  READ_FAILED_MAX_RETRIES: {
    message:
      'Não conseguimos ler o cartão. Verifique o cartão e tente de novo.',
    recoverable: false,
  },
  TIMEOUT: {
    message: 'Tempo esgotado. Inicie a cobrança novamente.',
    recoverable: false,
  },
  CANCELLED_BY_USER: {
    message: '',
    recoverable: false,
  },
  UNKNOWN: {
    message: 'Ocorreu um erro inesperado.',
    recoverable: false,
  },
};

/** Falhas de leitura que a máquina de estados tenta de novo sozinha (RN-07). */
const AUTO_RECOVERABLE: ReadonlySet<ErrorCode> = new Set([
  'CARD_REMOVED',
  'PROTOCOL_ERROR',
  'PARSE_ERROR',
]);

export function createError(code: ErrorCode, detail?: string): CashTapError {
  const entry = CATALOG[code];
  return detail === undefined
    ? { code, message: entry.message, recoverable: entry.recoverable }
    : { code, message: entry.message, detail, recoverable: entry.recoverable };
}

export function isAutoRecoverable(code: ErrorCode): boolean {
  return AUTO_RECOVERABLE.has(code);
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === 'string' &&
    (ERROR_CODES as readonly string[]).includes(value)
  );
}
