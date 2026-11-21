import { describe, expect, it } from '@jest/globals';
import { createError } from '../../errors';
import type { NativeCardRead } from '../../native';
import {
  CAPTURE_STATES,
  initialSnapshot,
  isTerminal,
  transition,
  type CaptureState,
  type Effect,
  type MachineContext,
  type MachineEvent,
  type MachineSnapshot,
} from '../machine';

const card: NativeCardRead = {
  pan: '4761739001010010',
  panMasked: '476173******0010',
  expiry: '2512',
  brand: 'visa',
  aid: 'A0000000031010',
  cryptogramPresent: true,
  stepDurationsMs: {
    SELECT_PPSE: 1,
    SELECT_AID: 1,
    GET_PROCESSING_OPTIONS: 1,
    READ_RECORD: 1,
  },
};

const someError = createError('UNKNOWN');

/** Monta um snapshot válido para qualquer estado, com o dado que o estado exige. */
function at(
  state: CaptureState,
  context: Partial<MachineContext> = {},
  extra: { error?: ReturnType<typeof createError>; card?: NativeCardRead } = {}
): MachineSnapshot {
  const ctx = { ...initialSnapshot(2).context, ...context };
  switch (state) {
    case 'RECOVERABLE_FAILURE':
    case 'TIMEOUT':
    case 'ERROR':
      return { state, context: ctx, error: extra.error ?? someError };
    case 'PROCESSING':
    case 'SUCCESS':
      return { state, context: ctx, card: extra.card ?? card };
    default:
      return { state, context: ctx };
  }
}

function run(snapshot: MachineSnapshot, ...events: MachineEvent[]) {
  let current = snapshot;
  const effects: Effect[] = [];
  for (const event of events) {
    const result = transition(current, event);
    current = result.snapshot;
    effects.push(...result.effects);
  }
  return { snapshot: current, effects };
}

const types = (effects: Effect[]) => effects.map((e) => e.type);
const errorCode = (s: MachineSnapshot) =>
  'error' in s ? s.error.code : undefined;

const ALL_EVENTS: MachineEvent[] = [
  { type: 'START' },
  { type: 'NFC_READY' },
  { type: 'NFC_UNAVAILABLE', error: createError('NFC_DISABLED') },
  { type: 'NFC_UNAVAILABLE', error: createError('NFC_UNSUPPORTED') },
  { type: 'TAG_DETECTED' },
  { type: 'WAIT_TIMEOUT' },
  { type: 'CANCEL' },
  { type: 'READ_SUCCEEDED', card },
  { type: 'READ_FAILED', error: createError('CARD_REMOVED') },
  { type: 'READ_FAILED', error: createError('UNSUPPORTED_BRAND') },
  { type: 'RETRY' },
  { type: 'PROCESS' },
  { type: 'RECHECK' },
  { type: 'FINISH' },
];

/** Varre estado × evento × variações de contexto (flags e contadores). */
function* everyTransition() {
  const contexts: Array<Partial<MachineContext>> = [
    {},
    { cancelRequested: true },
    { pendingTag: true },
    { cancelRequested: true, pendingTag: true },
    { failures: 3 },
    { failures: 1, pendingTag: true },
  ];
  const errors = [
    someError,
    createError('NFC_DISABLED'),
    createError('NFC_UNSUPPORTED'),
  ];
  for (const state of CAPTURE_STATES) {
    for (const context of contexts) {
      for (const error of errors) {
        const before = at(state, context, { error });
        for (const event of ALL_EVENTS) {
          yield { before, event, result: transition(before, event) };
        }
      }
    }
  }
}

describe('máquina de estados — tabela de transições (§4.2)', () => {
  it('IDLE + START → CHECKING, verificando e ligando o rádio', () => {
    const { snapshot, effects } = run(initialSnapshot(2), { type: 'START' });
    expect(snapshot.state).toBe('CHECKING');
    expect(types(effects)).toEqual(['START_READER']);
  });

  it('CHECKING + NFC pronto → WAITING_CARD e inicia o timer', () => {
    const { snapshot, effects } = run(at('CHECKING'), { type: 'NFC_READY' });
    expect(snapshot.state).toBe('WAITING_CARD');
    expect(types(effects)).toEqual(['START_WAIT_TIMER']);
  });

  it.each(['NFC_UNSUPPORTED', 'NFC_DISABLED'] as const)(
    'RN-01: CHECKING + %s → ERROR com o código do catálogo',
    (code) => {
      const { snapshot } = run(at('CHECKING'), {
        type: 'NFC_UNAVAILABLE',
        error: createError(code),
      });
      expect(snapshot.state).toBe('ERROR');
      expect(errorCode(snapshot)).toBe(code);
    }
  );

  it('WAITING_CARD + tag → READING: para o timer e lê o cartão', () => {
    const { snapshot, effects } = run(at('WAITING_CARD'), {
      type: 'TAG_DETECTED',
    });
    expect(snapshot.state).toBe('READING');
    expect(snapshot.context.attempts).toBe(1);
    expect(types(effects)).toEqual(['CLEAR_WAIT_TIMER', 'READ_CARD']);
  });

  it('RN-06: WAITING_CARD + timer → TIMEOUT (desfecho distinto de erro) e desliga o rádio', () => {
    const { snapshot, effects } = run(at('WAITING_CARD'), {
      type: 'WAIT_TIMEOUT',
    });
    expect(snapshot.state).toBe('TIMEOUT');
    expect(errorCode(snapshot)).toBe('TIMEOUT');
    expect(types(effects)).toEqual([
      'CLEAR_WAIT_TIMER',
      'STOP_READER',
      'SCHEDULE',
    ]);
  });

  it('RN-10: WAITING_CARD + cancelar → CANCELLED imediatamente', () => {
    const { snapshot, effects } = run(at('WAITING_CARD'), { type: 'CANCEL' });
    expect(snapshot.state).toBe('CANCELLED');
    expect(types(effects)).toEqual([
      'CLEAR_WAIT_TIMER',
      'STOP_READER',
      'SCHEDULE',
    ]);
  });

  it('READING + leitura ok → PROCESSING', () => {
    const { snapshot, effects } = run(at('READING'), {
      type: 'READ_SUCCEEDED',
      card,
    });
    expect(snapshot.state).toBe('PROCESSING');
    expect(effects).toEqual([
      { type: 'SCHEDULE', event: { type: 'PROCESS' }, delay: 'immediate' },
    ]);
  });

  it.each(['CARD_REMOVED', 'PROTOCOL_ERROR', 'PARSE_ERROR'] as const)(
    'RN-07: READING + %s → RECOVERABLE_FAILURE, contando a falha',
    (code) => {
      const { snapshot, effects } = run(at('READING'), {
        type: 'READ_FAILED',
        error: createError(code),
      });
      expect(snapshot.state).toBe('RECOVERABLE_FAILURE');
      expect(errorCode(snapshot)).toBe(code);
      expect(snapshot.context.failures).toBe(1);
      expect(effects).toEqual([
        { type: 'SCHEDULE', event: { type: 'RETRY' }, delay: 'recovery' },
      ]);
    }
  );

  it.each(['UNSUPPORTED_BRAND', 'INCOMPLETE_DATA', 'UNKNOWN'] as const)(
    'READING + %s (fatal) → ERROR e desliga o rádio',
    (code) => {
      const { snapshot, effects } = run(at('READING'), {
        type: 'READ_FAILED',
        error: createError(code),
      });
      expect(snapshot.state).toBe('ERROR');
      expect(errorCode(snapshot)).toBe(code);
      expect(types(effects)).toContain('STOP_READER');
    }
  );

  it('RN-09: RECOVERABLE_FAILURE + retry dentro do limite → WAITING_CARD reiniciando o timer', () => {
    const { snapshot, effects } = run(
      at('RECOVERABLE_FAILURE', { failures: 2 }),
      {
        type: 'RETRY',
      }
    );
    expect(snapshot.state).toBe('WAITING_CARD');
    expect(types(effects)).toEqual(['START_WAIT_TIMER']);
  });

  it('RN-08: RECOVERABLE_FAILURE + retry além do limite → ERROR READ_FAILED_MAX_RETRIES', () => {
    const { snapshot } = run(at('RECOVERABLE_FAILURE', { failures: 3 }), {
      type: 'RETRY',
    });
    expect(snapshot.state).toBe('ERROR');
    expect(errorCode(snapshot)).toBe('READ_FAILED_MAX_RETRIES');
  });

  it('D018: RECOVERABLE_FAILURE + cartão reaproximado → READING direto', () => {
    const { snapshot, effects } = run(
      at('RECOVERABLE_FAILURE', { failures: 1 }),
      {
        type: 'TAG_DETECTED',
      }
    );
    expect(snapshot.state).toBe('READING');
    expect(types(effects)).toEqual(['READ_CARD']);
  });

  it('RECOVERABLE_FAILURE + cartão reaproximado sem retentativa disponível é ignorado', () => {
    const result = transition(at('RECOVERABLE_FAILURE', { failures: 3 }), {
      type: 'TAG_DETECTED',
    });
    expect(result.changed).toBe(false);
  });

  it('RN-10: RECOVERABLE_FAILURE + cancelar → CANCELLED', () => {
    expect(
      run(at('RECOVERABLE_FAILURE'), { type: 'CANCEL' }).snapshot.state
    ).toBe('CANCELLED');
  });

  it('PROCESSING com dados válidos → SUCCESS', () => {
    const { snapshot } = run(at('PROCESSING'), { type: 'PROCESS' });
    expect(snapshot.state).toBe('SUCCESS');
  });

  it('RN-21: PROCESSING sem validade → ERROR INCOMPLETE_DATA, sem cartão no snapshot', () => {
    const { snapshot } = run(
      at('PROCESSING', {}, { card: { ...card, expiry: '' } }),
      {
        type: 'PROCESS',
      }
    );
    expect(snapshot.state).toBe('ERROR');
    expect(errorCode(snapshot)).toBe('INCOMPLETE_DATA');
    expect('card' in snapshot).toBe(false);
  });

  it.each(['SUCCESS', 'CANCELLED', 'TIMEOUT', 'ERROR'] as const)(
    '%s + FINISH → IDLE resolvendo o desfecho',
    (state) => {
      const { snapshot, effects } = run(at(state), { type: 'FINISH' });
      expect(snapshot.state).toBe('IDLE');
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ type: 'RESOLVE', outcome: { state } });
    }
  );
});

describe('cancelamento (RN-10, E5-H4, D018)', () => {
  it('READING + cancelar: aceita, pede o cancelamento ao nativo e continua lendo', () => {
    const { snapshot, effects } = run(at('READING'), { type: 'CANCEL' });
    expect(snapshot.state).toBe('READING');
    expect(snapshot.context.cancelRequested).toBe(true);
    expect(types(effects)).toEqual(['CANCEL_READ']);
  });

  it('cancelar duas vezes em READING não repete o pedido', () => {
    const { effects } = run(
      at('READING'),
      { type: 'CANCEL' },
      { type: 'CANCEL' }
    );
    expect(types(effects)).toEqual(['CANCEL_READ']);
  });

  it('cancelamento pendente vence uma leitura bem-sucedida', () => {
    const { snapshot } = run(
      at('READING'),
      { type: 'CANCEL' },
      { type: 'READ_SUCCEEDED', card }
    );
    expect(snapshot.state).toBe('CANCELLED');
  });

  it('cancelamento pendente vence uma falha recuperável', () => {
    const { snapshot } = run(
      at('READING'),
      { type: 'CANCEL' },
      { type: 'READ_FAILED', error: createError('CARD_REMOVED') }
    );
    expect(snapshot.state).toBe('CANCELLED');
  });

  it('nativo respondendo CANCELLED_BY_USER também leva a CANCELLED', () => {
    const { snapshot } = run(at('READING'), {
      type: 'READ_FAILED',
      error: createError('CANCELLED_BY_USER'),
    });
    expect(snapshot.state).toBe('CANCELLED');
  });

  it('cancelar durante CHECKING vale quando o NFC responder pronto', () => {
    const { snapshot } = run(
      at('CHECKING'),
      { type: 'CANCEL' },
      { type: 'NFC_READY' }
    );
    expect(snapshot.state).toBe('CANCELLED');
  });

  it('cancelar durante CHECKING com NFC desligado encerra como CANCELLED (não espera o operador)', () => {
    const { snapshot, effects } = run(
      at('CHECKING'),
      { type: 'CANCEL' },
      { type: 'NFC_UNAVAILABLE', error: createError('NFC_DISABLED') }
    );
    expect(snapshot.state).toBe('CANCELLED');
    expect(effects).toContainEqual({
      type: 'SCHEDULE',
      event: { type: 'FINISH' },
      delay: 'immediate',
    });
  });

  it.each(['PROCESSING', 'SUCCESS', 'TIMEOUT', 'CANCELLED'] as const)(
    'D018: cancelar em %s é ignorado — o resultado já existe',
    (state) => {
      expect(transition(at(state), { type: 'CANCEL' }).changed).toBe(false);
    }
  );

  it('D018: cancelar em ERROR comum é ignorado (já vai encerrar)', () => {
    expect(transition(at('ERROR'), { type: 'CANCEL' }).changed).toBe(false);
  });
});

describe('NFC indisponível (RN-01, RN-02, D018)', () => {
  const disabled = at('ERROR', {}, { error: createError('NFC_DISABLED') });

  it('RN-02: NFC desligado não encerra sozinho: espera o operador', () => {
    const { effects } = run(at('CHECKING'), {
      type: 'NFC_UNAVAILABLE',
      error: createError('NFC_DISABLED'),
    });
    expect(types(effects)).toEqual(['STOP_READER']);
  });

  it('RN-02: reverificar volta a CHECKING, liga o rádio e limpa as flags', () => {
    const { snapshot, effects } = run(
      at(
        'ERROR',
        { cancelRequested: true, pendingTag: true },
        { error: createError('NFC_DISABLED') }
      ),
      { type: 'RECHECK' }
    );
    expect(snapshot.state).toBe('CHECKING');
    expect(snapshot.context.cancelRequested).toBe(false);
    expect(snapshot.context.pendingTag).toBe(false);
    expect(types(effects)).toEqual(['START_READER']);
  });

  it('cancelar na tela de NFC desligado encerra com NFC_DISABLED', () => {
    const { snapshot, effects } = run(disabled, { type: 'CANCEL' });
    expect(snapshot.state).toBe('IDLE');
    expect(effects[0]).toMatchObject({
      type: 'RESOLVE',
      outcome: { state: 'ERROR', error: { code: 'NFC_DISABLED' } },
    });
  });

  it('RN-01: NFC_UNSUPPORTED encerra imediatamente, sem tela', () => {
    const { effects } = run(at('CHECKING'), {
      type: 'NFC_UNAVAILABLE',
      error: createError('NFC_UNSUPPORTED'),
    });
    expect(effects).toContainEqual({
      type: 'SCHEDULE',
      event: { type: 'FINISH' },
      delay: 'immediate',
    });
  });

  it.each(['WAITING_CARD', 'RECOVERABLE_FAILURE'] as const)(
    'D018: NFC desligado em %s vai direto para ERROR(NFC_DISABLED), sem esperar o timeout',
    (state) => {
      const { snapshot, effects } = run(at(state), {
        type: 'NFC_UNAVAILABLE',
        error: createError('NFC_DISABLED'),
      });
      expect(snapshot.state).toBe('ERROR');
      expect(errorCode(snapshot)).toBe('NFC_DISABLED');
      expect(types(effects)).toContain('STOP_READER');
      if (state === 'WAITING_CARD')
        expect(types(effects)).toContain('CLEAR_WAIT_TIMER');
    }
  );

  it('RECHECK com outro erro é ignorado', () => {
    expect(transition(at('ERROR'), { type: 'RECHECK' }).changed).toBe(false);
  });
});

describe('NFC desligado durante a leitura (D018)', () => {
  const off: MachineEvent = {
    type: 'NFC_UNAVAILABLE',
    error: createError('NFC_DISABLED'),
  };

  it('pede o cancelamento da leitura e guarda o erro', () => {
    const { snapshot, effects } = run(at('READING'), off);
    expect(snapshot.state).toBe('READING');
    expect(snapshot.context.nfcError?.code).toBe('NFC_DISABLED');
    expect(types(effects)).toEqual(['CANCEL_READ']);
  });

  it.each([
    ['falha recuperável', createError('CARD_REMOVED')],
    ['cancelamento do nativo', createError('CANCELLED_BY_USER')],
  ])('%s depois disso termina em ERROR(NFC_DISABLED)', (_, error) => {
    const { snapshot } = run(at('READING'), off, {
      type: 'READ_FAILED',
      error,
    });
    expect(snapshot.state).toBe('ERROR');
    expect(errorCode(snapshot)).toBe('NFC_DISABLED');
  });

  it('leitura que ainda assim concluiu vale', () => {
    expect(
      run(at('READING'), off, { type: 'READ_SUCCEEDED', card }).snapshot.state
    ).toBe('PROCESSING');
  });

  it('cancelamento do operador continua vencendo', () => {
    const { snapshot } = run(at('READING'), { type: 'CANCEL' }, off, {
      type: 'READ_FAILED',
      error: createError('CANCELLED_BY_USER'),
    });
    expect(snapshot.state).toBe('CANCELLED');
  });
});

describe('tag pendente (D017, D018)', () => {
  it('cartão reaproximado durante a leitura é lembrado, sem nova leitura concorrente', () => {
    const { snapshot, effects } = run(at('READING'), { type: 'TAG_DETECTED' });
    expect(snapshot.state).toBe('READING');
    expect(snapshot.context.pendingTag).toBe(true);
    expect(effects).toEqual([]);
  });

  it('falha recuperável com tag pendente lê de novo imediatamente', () => {
    const { snapshot, effects } = run(
      at('READING'),
      { type: 'TAG_DETECTED' },
      { type: 'READ_FAILED', error: createError('CARD_REMOVED') }
    );
    expect(snapshot.state).toBe('RECOVERABLE_FAILURE');
    expect(effects).toEqual([
      { type: 'SCHEDULE', event: { type: 'TAG_DETECTED' }, delay: 'immediate' },
    ]);
    const next = run(snapshot, { type: 'TAG_DETECTED' });
    expect(next.snapshot.state).toBe('READING');
    expect(next.snapshot.context.pendingTag).toBe(false);
  });

  it('tag pendente não fura o limite de retentativas', () => {
    const { effects } = run(
      at('READING', { failures: 2, maxRetries: 2 }),
      { type: 'TAG_DETECTED' },
      { type: 'READ_FAILED', error: createError('CARD_REMOVED') }
    );
    expect(effects).toEqual([
      { type: 'SCHEDULE', event: { type: 'RETRY' }, delay: 'recovery' },
    ]);
  });

  it('cartão já no campo durante CHECKING é lido assim que o NFC fica pronto, sem timer', () => {
    const { snapshot, effects } = run(
      at('CHECKING'),
      { type: 'TAG_DETECTED' },
      { type: 'NFC_READY' }
    );
    expect(snapshot.state).toBe('READING');
    expect(types(effects)).toEqual(['READ_CARD']);
  });
});

describe('invariantes (§4.3) — varredura estado × evento × contexto', () => {
  it('INV-1: toda entrada em estado terminal desliga o reader mode', () => {
    for (const { before, result } of everyTransition()) {
      if (
        result.changed &&
        isTerminal(result.snapshot.state) &&
        result.snapshot.state !== before.state
      ) {
        expect(types(result.effects)).toContain('STOP_READER');
      }
    }
  });

  it('INV-3: RESOLVE só sai de estado terminal, uma vez, levando a IDLE', () => {
    for (const { before, result } of everyTransition()) {
      const resolves = types(result.effects).filter((t) => t === 'RESOLVE');
      if (resolves.length > 0) {
        expect(resolves).toHaveLength(1);
        expect(isTerminal(before.state)).toBe(true);
        expect(result.snapshot.state).toBe('IDLE');
      }
    }
  });

  it('INV-4: nenhuma transição chega a SUCCESS sem PAN e validade', () => {
    for (const state of CAPTURE_STATES) {
      if (state === 'SUCCESS') continue;
      for (const event of ALL_EVENTS) {
        const result = transition(
          at(state, {}, { card: { ...card, pan: '' } }),
          event
        );
        expect(result.snapshot.state).not.toBe('SUCCESS');
      }
    }
  });

  it('INV-5: só WAITING_CARD inicia o timer; toda saída dele o encerra', () => {
    for (const { before, result } of everyTransition()) {
      if (!result.changed) continue;
      const effects = types(result.effects);
      if (effects.includes('START_WAIT_TIMER')) {
        expect(result.snapshot.state).toBe('WAITING_CARD');
      }
      if (
        before.state === 'WAITING_CARD' &&
        result.snapshot.state !== 'WAITING_CARD'
      ) {
        expect(effects).toContain('CLEAR_WAIT_TIMER');
      }
    }
  });

  it('estados terminais e IDLE nunca carregam flags de operação pendentes', () => {
    for (const { result } of everyTransition()) {
      if (!result.changed) continue;
      if (
        isTerminal(result.snapshot.state) ||
        result.snapshot.state === 'IDLE'
      ) {
        expect(result.snapshot.context.cancelRequested).toBe(false);
        expect(result.snapshot.context.pendingTag).toBe(false);
        expect(result.snapshot.context.nfcError).toBeUndefined();
      }
    }
  });

  it('eventos fora de contexto são ignorados sem efeitos', () => {
    expect(
      transition(initialSnapshot(2), { type: 'READ_SUCCEEDED', card })
    ).toEqual({
      snapshot: initialSnapshot(2),
      effects: [],
      changed: false,
    });
    expect(transition(at('SUCCESS'), { type: 'TAG_DETECTED' }).changed).toBe(
      false
    );
  });
});

describe('retentativas ponta a ponta na máquina (E5-H3)', () => {
  function failAndRetry(snapshot: MachineSnapshot) {
    return run(
      snapshot,
      { type: 'TAG_DETECTED' },
      { type: 'READ_FAILED', error: createError('CARD_REMOVED') },
      { type: 'RETRY' }
    ).snapshot;
  }

  it('RN-08: maxRetries = 2 e 3 falhas → READ_FAILED_MAX_RETRIES', () => {
    let snapshot: MachineSnapshot = {
      ...initialSnapshot(2),
      state: 'WAITING_CARD',
    };
    snapshot = failAndRetry(snapshot);
    expect(snapshot.state).toBe('WAITING_CARD');
    snapshot = failAndRetry(snapshot);
    expect(snapshot.state).toBe('WAITING_CARD');
    snapshot = failAndRetry(snapshot);
    expect(snapshot.state).toBe('ERROR');
    expect(errorCode(snapshot)).toBe('READ_FAILED_MAX_RETRIES');
    expect(snapshot.context.attempts).toBe(3);
  });

  it('RN-08: maxRetries = 0 → erro na primeira falha', () => {
    const snapshot = failAndRetry({
      ...initialSnapshot(0),
      state: 'WAITING_CARD',
    });
    expect(snapshot.state).toBe('ERROR');
    expect(errorCode(snapshot)).toBe('READ_FAILED_MAX_RETRIES');
  });
});
