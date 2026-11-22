import type { CaptureState } from './core/machine';
import type { CashTapError } from './errors';

export const NFC_STATUSES = ['UNSUPPORTED', 'DISABLED', 'READY'] as const;

/** Disponibilidade do NFC no aparelho. */
export type NfcStatus = (typeof NFC_STATUSES)[number];

/** Cancela uma assinatura de evento. */
export type Unsubscribe = () => void;

export const CARD_BRANDS = ['visa', 'mastercard'] as const;

/** Bandeira inferida pelo AID do cartão, nunca pelo PAN (RN-20). */
export type CardBrand = (typeof CARD_BRANDS)[number];

export const EMV_STEPS = [
  'SELECT_PPSE',
  'SELECT_AID',
  'GET_PROCESSING_OPTIONS',
  'READ_RECORD',
] as const;

/** Etapas do diálogo com o cartão, medidas separadamente (E8-H2). */
export type EmvStep = (typeof EMV_STEPS)[number];

/** Parâmetros de uma captura. Só `amountCents` é obrigatório. */
export type CaptureParams = {
  /** Valor da cobrança em centavos: inteiro e maior que zero (RN-03). */
  amountCents: number;
  /** Código ISO 4217 numérico de 3 dígitos. Padrão: `'986'` (BRL). */
  currencyCode?: string;
  /** Identificador da cobrança no app hospedeiro, devolvido em `meta.reference`. */
  reference?: string;
  /** Espera máxima pela aproximação, em ms. Padrão 30 000; faixa 10 000–120 000 (RN-05). */
  timeoutMs?: number;
  /** Retentativas automáticas em falha recuperável. Padrão 2; faixa 0–5 (RN-08). */
  maxRetries?: number;
  /** Registra transições, tempos e comandos (mascarados) para o painel de diagnóstico (E7-H3). */
  diagnostics?: boolean;
  /** Aparência só desta captura; sobrepõe a do `CashTapProvider` (E6-H3). */
  appearance?: CashTapAppearance;
};

/** Dados do cartão, já normalizados. */
export type CardData = {
  /** Número completo: entregue uma única vez, só aqui (RN-24). */
  pan: string;
  /** `123456******7890`: use este em logs e telas. */
  panMasked: string;
  /** Validade no formato AAMM. */
  expiry: string;
  brand: CardBrand;
  /** Identificador da aplicação de pagamento selecionada. */
  aid: string;
  applicationLabel?: string;
  panSequenceNumber?: string;
};

export type StepTiming = { step: EmvStep; durationMs: number };

/** Metadados do ciclo (E8-H2). */
export type CaptureMeta = {
  captureId: string;
  reference?: string;
  /** Início da captura (epoch ms). */
  startedAt: number;
  /** Duração total, do `capture()` à resolução (relógio monotônico). */
  durationMs: number;
  /** Leituras iniciadas, contando as retentativas automáticas. */
  attempts: number;
  /** Da detecção do cartão ao resultado da leitura bem-sucedida. */
  readDurationMs?: number;
  /** Tempo de cada etapa do diálogo na leitura bem-sucedida. */
  stepTimings: StepTiming[];
  /** O cartão gerou criptograma (o valor nunca é exposto — RN-27). */
  cryptogramPresent?: boolean;
};

/** Desfecho de `capture()`. Nunca rejeita por erro esperado. */
export type CaptureResult =
  | { status: 'success'; card: CardData; meta: CaptureMeta }
  | { status: 'cancelled'; meta: CaptureMeta }
  | { status: 'timeout'; error: CashTapError; meta: CaptureMeta }
  | { status: 'error'; error: CashTapError; meta: CaptureMeta };

export type { CaptureState };

/** Notificação de transição do ciclo, para instrumentação do app hospedeiro. */
export type CaptureStateEvent = {
  state: CaptureState;
  previous: CaptureState;
  captureId: string;
  /** Leituras iniciadas até aqui. */
  attempts: number;
  error?: CashTapError;
  /** Relógio monotônico, em ms. */
  timestamp: number;
};

// ---- Aparência (E6-H3) ----

export type CashTapColors = {
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  onPrimary: string;
  /** Fundo da folha do modal. */
  background: string;
  /** Véu sobre o app hospedeiro. */
  scrim: string;
  /** Superfície translúcida (botões secundários, chips, cartões). */
  surface: string;
  surfaceStrong: string;
  border: string;
  /** Traço de ilustrações (silhueta do celular). */
  line: string;
  text: string;
  textMuted: string;
  success: string;
  successSoft: string;
  onSuccess: string;
  error: string;
  errorSoft: string;
  warning: string;
  warningSoft: string;
  onWarning: string;
  /** Cartão ilustrado. */
  card: string;
};

export type CashTapTexts = {
  brandName: string;
  secureBadge: string;
  amountLabel: string;
  checkingTitle: string;
  checkingHint: string;
  waitingTitle: string;
  waitingHint: string;
  waitingRetryHint: string;
  readingTitle: string;
  readingHint: string;
  /** Rótulos das quatro etapas da barra de progresso da leitura. */
  stepConnect: string;
  stepApplication: string;
  stepAuthorize: string;
  stepRecords: string;
  cancelling: string;
  recoverableTitle: string;
  processingTitle: string;
  processingHint: string;
  successTitle: string;
  successHint: string;
  timeoutTitle: string;
  /** `{seconds}` é substituído. */
  timeoutHint: string;
  errorTitle: string;
  unsupportedBrandTitle: string;
  nfcDisabledTitle: string;
  nfcDisabledHint: string;
  cancel: string;
  close: string;
  openSettings: string;
  recheck: string;
  /** `{current}` e `{total}` são substituídos. */
  attempt: string;
  expiryLabel: string;
};

/** Aparência informada pelo integrador: tudo opcional, mesclado sobre o padrão. */
export type CashTapAppearance = {
  /** Base: `'dark'` (padrão) ou `'light'`. */
  mode?: 'dark' | 'light';
  /** Ao trocar só `primary`, `text`, `background`, `success` ou `error`, as variações são derivadas. */
  colors?: Partial<CashTapColors>;
  fontFamily?: string;
  /** Raio de botões e cartões; a folha usa o dobro. */
  borderRadius?: number;
  texts?: Partial<CashTapTexts>;
  /** Vibração nas trocas de estado. Padrão: `true`. */
  haptics?: boolean;
};
