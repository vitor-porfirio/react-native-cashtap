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
