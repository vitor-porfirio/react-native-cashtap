import { createError, type CashTapError } from '../errors';
import type { CaptureParams, CashTapAppearance } from '../types';

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MIN_TIMEOUT_MS = 10_000;
export const MAX_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_RETRIES = 2;
export const MIN_MAX_RETRIES = 0;
export const MAX_MAX_RETRIES = 5;
export const DEFAULT_CURRENCY_CODE = '986';
/** Limite do campo 9F02 (n12). */
export const MAX_AMOUNT_CENTS = 999_999_999_999;

/** Parâmetros já validados e com padrões aplicados. */
export type ResolvedParams = {
  amountCents: number;
  currencyCode: string;
  reference?: string;
  timeoutMs: number;
  maxRetries: number;
  diagnostics: boolean;
  appearance?: CashTapAppearance;
};

/** `reference` só é aceito como string; qualquer outra coisa é descartada. */
export function normalizeReference(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * RN-03: valor obrigatório, inteiro, em centavos, > 0 — validado antes de acionar o rádio.
 * RN-05 / RN-08: timeout e retentativas fora da faixa são ajustados ao limite mais próximo (E5-H2).
 */
export function resolveParams(
  params: CaptureParams
): { ok: true; params: ResolvedParams } | { ok: false; error: CashTapError } {
  const { amountCents } = params;
  if (
    typeof amountCents !== 'number' ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > MAX_AMOUNT_CENTS
  ) {
    return {
      ok: false,
      error: createError(
        'INVALID_AMOUNT',
        `amountCents=${String(amountCents)}`
      ),
    };
  }

  const currencyCode = params.currencyCode ?? DEFAULT_CURRENCY_CODE;
  // Moeda inválida usa INVALID_AMOUNT: é parâmetro da cobrança, não do aparelho (D018).
  if (typeof currencyCode !== 'string' || !/^\d{3}$/.test(currencyCode)) {
    return {
      ok: false,
      error: createError(
        'INVALID_AMOUNT',
        `currencyCode deve ser o código ISO 4217 numérico de 3 dígitos (ex.: "986"), recebido "${currencyCode}"`
      ),
    };
  }

  // RN-05 / RN-08: ausente ou NaN → padrão; fora da faixa (inclusive ±Infinity) → limite mais próximo.
  const timeoutMs =
    typeof params.timeoutMs === 'number' && !Number.isNaN(params.timeoutMs)
      ? clamp(Math.round(params.timeoutMs), MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

  const maxRetries =
    typeof params.maxRetries === 'number' && !Number.isNaN(params.maxRetries)
      ? clamp(Math.floor(params.maxRetries), MIN_MAX_RETRIES, MAX_MAX_RETRIES)
      : DEFAULT_MAX_RETRIES;

  return {
    ok: true,
    params: {
      amountCents,
      currencyCode,
      reference: normalizeReference(params.reference),
      timeoutMs,
      maxRetries,
      diagnostics: params.diagnostics === true,
      ...(params.appearance !== undefined && { appearance: params.appearance }),
    },
  };
}
