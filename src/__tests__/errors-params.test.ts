import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_CURRENCY_CODE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  resolveParams,
} from '../core/params';
import {
  createError,
  ERROR_CODES,
  isAutoRecoverable,
  isErrorCode,
} from '../errors';

describe('catálogo de erros (§5)', () => {
  it('todo código tem mensagem em pt-BR, exceto o cancelamento pelo operador', () => {
    for (const code of ERROR_CODES) {
      const error = createError(code);
      if (code === 'CANCELLED_BY_USER') {
        expect(error.message).toBe('');
      } else {
        expect(error.message.length).toBeGreaterThan(10);
      }
    }
  });

  it('mensagens falam com o operador: nenhuma expõe detalhe técnico', () => {
    for (const code of ERROR_CODES) {
      expect(createError(code).message).not.toMatch(
        /SW|APDU|TLV|AID|0x|9000|6A82/
      );
    }
  });

  it('mensagens do catálogo conferem com a especificação', () => {
    expect(createError('NFC_DISABLED').message).toBe(
      'O NFC está desligado. Ative-o nas configurações do aparelho para continuar.'
    );
    expect(createError('CARD_REMOVED').message).toBe(
      'O cartão foi afastado antes da leitura terminar. Aproxime novamente.'
    );
    expect(createError('UNSUPPORTED_BRAND').message).toBe(
      'Este cartão não é aceito. Tente um cartão Visa ou Mastercard.'
    );
  });

  it('recuperabilidade conforme o catálogo', () => {
    const recoverable = ERROR_CODES.filter((c) => createError(c).recoverable);
    expect(recoverable).toEqual([
      'NFC_DISABLED',
      'CARD_REMOVED',
      'PROTOCOL_ERROR',
      'PARSE_ERROR',
    ]);
  });

  it('RN-07: só falhas de leitura são automaticamente recuperáveis', () => {
    expect(ERROR_CODES.filter(isAutoRecoverable)).toEqual([
      'CARD_REMOVED',
      'PROTOCOL_ERROR',
      'PARSE_ERROR',
    ]);
  });

  it('detail é opcional e não altera a mensagem', () => {
    expect(createError('UNKNOWN')).not.toHaveProperty('detail');
    expect(createError('UNKNOWN', 'IOException')).toEqual({
      code: 'UNKNOWN',
      message: 'Ocorreu um erro inesperado.',
      detail: 'IOException',
      recoverable: false,
    });
  });

  it('isErrorCode reconhece só códigos do catálogo', () => {
    expect(isErrorCode('TIMEOUT')).toBe(true);
    expect(isErrorCode('timeout')).toBe(false);
    expect(isErrorCode(1)).toBe(false);
  });
});

describe('resolveParams', () => {
  it('aplica os padrões', () => {
    expect(resolveParams({ amountCents: 100 })).toEqual({
      ok: true,
      params: {
        amountCents: 100,
        currencyCode: DEFAULT_CURRENCY_CODE,
        reference: undefined,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        diagnostics: false,
      },
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e15, '100'])(
    'RN-03: rejeita amountCents=%p',
    (amountCents) => {
      const result = resolveParams({ amountCents: amountCents as number });
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_AMOUNT' },
      });
    }
  );

  it.each(['BRL', '98', '9860', ''])(
    'rejeita currencyCode=%p',
    (currencyCode) => {
      expect(resolveParams({ amountCents: 1, currencyCode })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_AMOUNT' },
      });
    }
  );

  it.each([
    [5_000, 10_000],
    [10_000, 10_000],
    [45_000.4, 45_000],
    [120_000, 120_000],
    [999_999, 120_000],
    [Number.NaN, DEFAULT_TIMEOUT_MS],
  ])('RN-05: timeoutMs=%p vira %p', (timeoutMs, expected) => {
    const result = resolveParams({ amountCents: 1, timeoutMs });
    expect(result.ok && result.params.timeoutMs).toBe(expected);
  });

  it.each([
    [-1, 0],
    [0, 0],
    [3.9, 3],
    [5, 5],
    [10, 5],
  ])('RN-08: maxRetries=%p vira %p', (maxRetries, expected) => {
    const result = resolveParams({ amountCents: 1, maxRetries });
    expect(result.ok && result.params.maxRetries).toBe(expected);
  });

  it('preserva referência e diagnóstico', () => {
    const result = resolveParams({
      amountCents: 1,
      reference: 'r1',
      diagnostics: true,
    });
    expect(result).toMatchObject({
      ok: true,
      params: { reference: 'r1', diagnostics: true },
    });
  });
});
