import { describe, expect, it } from '@jest/globals';
import { createError } from '../../errors';
import type { MachineSnapshot as S } from '../machine';

const ctx = {
  maxRetries: 2,
  attempts: 0,
  failures: 0,
  cancelRequested: false,
  pendingTag: false,
};
const err = createError('UNKNOWN');

describe('#19: estados impossíveis não compilam', () => {
  it('o compilador rejeita snapshots incoerentes', () => {
    // @ts-expect-error SUCCESS exige cartão
    const a: S = { state: 'SUCCESS', context: ctx };
    // @ts-expect-error ERROR exige erro
    const b: S = { state: 'ERROR', context: ctx };
    // @ts-expect-error IDLE não carrega erro
    const c: S = { state: 'IDLE', context: ctx, error: err };
    const ok: S = { state: 'TIMEOUT', context: ctx, error: err };
    expect([a, b, c, ok]).toHaveLength(4);
  });
});
