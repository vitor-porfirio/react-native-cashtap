import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { NativeCardRead, NativeReadOutcome } from '../../native';
import type { CaptureStateEvent, NfcStatus } from '../../types';
import {
  __resetForTests,
  __setDepsForTests,
  cancel,
  capture,
  dispatchFromUi,
  getActiveSession,
  onStateChange,
  registerUiHost,
  subscribeActiveSession,
} from '../controller';
import { getLastDiagnostics } from '../diagnostics';
import { DEFAULT_DISPLAY_DURATIONS, type NativePort } from '../session';
import type { DiagnosticExchange } from '../../native';

const card: NativeCardRead = {
  pan: '4761739001010010',
  panMasked: '476173******0010',
  expiry: '2512',
  brand: 'visa',
  aid: 'A0000000031010',
  applicationLabel: 'VISA CREDITO',
  cryptogramPresent: true,
  stepDurationsMs: {
    SELECT_PPSE: 20,
    SELECT_AID: 15,
    GET_PROCESSING_OPTIONS: 90,
    READ_RECORD: 35,
  },
};

/** Nativo simulado: o teste controla quando cada operação termina. */
class FakeNative implements NativePort {
  readerOn = false;
  readerStarts = 0;
  cancelReads = 0;
  readCalls: Array<[number, string, boolean]> = [];
  startResult: Awaited<ReturnType<NativePort['startReaderMode']>> = {
    ok: true,
  };
  private pendingRead: ((outcome: NativeReadOutcome) => void) | null = null;
  private tagListeners = new Set<() => void>();
  private statusListeners = new Set<(s: NfcStatus) => void>();

  startReaderMode = jest.fn(async () => {
    this.readerStarts++;
    if (this.startResult.ok) this.readerOn = true;
    return this.startResult;
  });
  stopReaderMode = jest.fn(async () => {
    this.readerOn = false;
  });
  readCard = jest.fn(
    (amountCents: number, currencyCode: string, diagnostics: boolean) => {
      this.readCalls.push([amountCents, currencyCode, diagnostics]);
      return new Promise<NativeReadOutcome>((resolve) => {
        this.pendingRead = resolve;
      });
    }
  );
  cancelRead = jest.fn(() => {
    this.cancelReads++;
  });
  onTagDetected = (listener: () => void) => {
    this.tagListeners.add(listener);
    return () => this.tagListeners.delete(listener);
  };
  diagnosticListeners = new Set<(e: DiagnosticExchange) => void>();
  onDiagnostic = (listener: (e: DiagnosticExchange) => void) => {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  };
  onNfcStatusChange = (listener: (s: NfcStatus) => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  get listenerCount() {
    return this.tagListeners.size + this.statusListeners.size;
  }

  tap() {
    this.tagListeners.forEach((l) => l());
  }

  setNfc(status: NfcStatus) {
    this.statusListeners.forEach((l) => l(status));
  }

  finishRead(outcome: NativeReadOutcome) {
    const resolve = this.pendingRead;
    this.pendingRead = null;
    resolve?.(outcome);
  }

  get reading() {
    return this.pendingRead !== null;
  }
}

let native: FakeNative;
let clock = 0;

async function flush() {
  // Resolve promises pendentes e timers de 0 ms.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    jest.advanceTimersByTime(0);
  }
}

async function advance(ms: number) {
  clock += ms;
  jest.advanceTimersByTime(ms);
  await flush();
}

beforeEach(() => {
  jest.useFakeTimers();
  clock = 1_000;
  native = new FakeNative();
  __resetForTests();
  __setDepsForTests({
    native,
    clock: { now: () => clock, epochMs: () => 1_795_000_000_000 },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

function states() {
  const seen: CaptureStateEvent[] = [];
  onStateChange((e) => seen.push(e));
  return seen;
}

describe('capture() — caminho feliz (E5-H1)', () => {
  it('conduz CHECKING → WAITING → READING → PROCESSING → SUCCESS → IDLE e resolve com os dados', async () => {
    const seen = states();
    const promise = capture({ amountCents: 1050, reference: 'pedido-42' });
    await flush();
    expect(native.readerOn).toBe(true);

    clock += 100;
    native.tap();
    await flush();
    expect(native.readCalls).toEqual([[1050, '0986', false]]);

    clock += 250;
    native.finishRead({ ok: true, card });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);

    const result = await promise;
    expect(seen.map((e) => e.state)).toEqual([
      'CHECKING',
      'WAITING_CARD',
      'READING',
      'PROCESSING',
      'SUCCESS',
      'IDLE',
    ]);
    expect(result).toEqual({
      status: 'success',
      card: {
        pan: card.pan,
        panMasked: card.panMasked,
        expiry: '2512',
        brand: 'visa',
        aid: 'A0000000031010',
        applicationLabel: 'VISA CREDITO',
      },
      meta: expect.objectContaining({
        reference: 'pedido-42',
        startedAt: 1_795_000_000_000,
        attempts: 1,
        readDurationMs: 250,
        cryptogramPresent: true,
        stepTimings: [
          { step: 'SELECT_PPSE', durationMs: 20 },
          { step: 'SELECT_AID', durationMs: 15 },
          { step: 'GET_PROCESSING_OPTIONS', durationMs: 90 },
          { step: 'READ_RECORD', durationMs: 35 },
        ],
      }),
    });
    // D018: duração vai até o desfecho, sem o tempo de exibição da tela de sucesso.
    expect(result.meta.durationMs).toBe(350);
    expect(result.meta.captureId).toMatch(/^ct_/);
  });

  it('INV-1 / RN-11: ao final o reader mode está desligado e os listeners removidos', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    native.finishRead({ ok: true, card });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    await promise;
    expect(native.readerOn).toBe(false);
    expect(native.listenerCount).toBe(0);
    expect(getActiveSession()).toBeNull();
  });

  it('repassa moeda e diagnóstico ao nativo', async () => {
    const promise = capture({
      amountCents: 100,
      currencyCode: '840',
      diagnostics: true,
    });
    await flush();
    native.tap();
    await flush();
    expect(native.readCalls[0]).toEqual([100, '0840', true]);
    cancel();
    native.finishRead({ ok: false, code: 'CANCELLED_BY_USER', detail: '' });
    await flush();
    await promise;
  });
});

describe('validação antes do rádio (RN-03, RN-04)', () => {
  it.each([0, -5, 10.5, Number.NaN])(
    'RN-03: amountCents=%p resolve INVALID_AMOUNT sem ligar o rádio',
    async (amountCents) => {
      const result = await capture({ amountCents });
      expect(result).toMatchObject({
        status: 'error',
        error: { code: 'INVALID_AMOUNT' },
      });
      expect(native.startReaderMode).not.toHaveBeenCalled();
    }
  );

  it('RN-04 / INV-2: segunda captura concorrente é rejeitada com ALREADY_RUNNING sem afetar a primeira', async () => {
    const first = capture({ amountCents: 100 });
    await flush();
    const second = await capture({ amountCents: 200 });
    expect(second).toMatchObject({
      status: 'error',
      error: { code: 'ALREADY_RUNNING' },
    });
    expect(native.startReaderMode).toHaveBeenCalledTimes(1);
    expect(getActiveSession()?.params.amountCents).toBe(100);
    cancel();
    await flush();
    await expect(first).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('nova captura é aceita depois que a anterior termina', async () => {
    const first = capture({ amountCents: 100 });
    await flush();
    cancel();
    await flush();
    await first;
    const second = capture({ amountCents: 200 });
    await flush();
    expect(getActiveSession()?.params.amountCents).toBe(200);
    cancel();
    await flush();
    await second;
  });
});

describe('NFC indisponível (RN-01, RN-02)', () => {
  it('RN-01: sem NFC resolve NFC_UNSUPPORTED imediatamente', async () => {
    native.startResult = { ok: false, code: 'NFC_UNSUPPORTED', detail: '' };
    const promise = capture({ amountCents: 100 });
    await flush();
    await expect(promise).resolves.toMatchObject({
      status: 'error',
      error: { code: 'NFC_UNSUPPORTED', recoverable: false },
    });
  });

  it('RN-02: NFC desligado espera o operador e reverifica quando ele liga o NFC', async () => {
    native.startResult = { ok: false, code: 'NFC_DISABLED', detail: '' };
    const seen = states();
    const promise = capture({ amountCents: 100 });
    await flush();
    await advance(60_000);
    expect(getActiveSession()?.state).toBe('ERROR');

    native.startResult = { ok: true };
    native.setNfc('READY');
    await flush();
    expect(getActiveSession()?.state).toBe('WAITING_CARD');
    expect(seen.map((e) => e.state)).toEqual([
      'CHECKING',
      'ERROR',
      'CHECKING',
      'WAITING_CARD',
    ]);

    cancel();
    await flush();
    await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('RN-02: reverificação pela UI', async () => {
    native.startResult = { ok: false, code: 'NFC_DISABLED', detail: '' };
    const promise = capture({ amountCents: 100 });
    await flush();
    native.startResult = { ok: true };
    dispatchFromUi({ type: 'RECHECK' });
    await flush();
    expect(getActiveSession()?.state).toBe('WAITING_CARD');
    cancel();
    await flush();
    await promise;
  });

  it('operador fecha a tela de NFC desligado: resolve com NFC_DISABLED', async () => {
    native.startResult = { ok: false, code: 'NFC_DISABLED', detail: '' };
    const promise = capture({ amountCents: 100 });
    await flush();
    dispatchFromUi({ type: 'FINISH' });
    await flush();
    await expect(promise).resolves.toMatchObject({
      status: 'error',
      error: { code: 'NFC_DISABLED', recoverable: true },
    });
  });
});

describe('timeout (E5-H2)', () => {
  it('RN-05 / RN-06: sem aproximação, expira em 30 s como TIMEOUT e desliga o rádio', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    await advance(29_999);
    expect(getActiveSession()?.state).toBe('WAITING_CARD');
    await advance(1);
    expect(native.readerOn).toBe(false);
    await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    await expect(promise).resolves.toMatchObject({
      status: 'timeout',
      error: { code: 'TIMEOUT' },
    });
  });

  it.each([
    [1_000, 10_000],
    [500_000, 120_000],
  ])('E5-H2: timeoutMs=%p é ajustado para %p', async (requested, effective) => {
    const promise = capture({ amountCents: 100, timeoutMs: requested });
    await flush();
    await advance(effective - 1);
    expect(getActiveSession()?.state).toBe('WAITING_CARD');
    await advance(1);
    expect(getActiveSession()?.state).toBe('TIMEOUT');
    await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    await promise;
  });

  it('INV-5: timer não dispara depois que o cartão foi detectado', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    await advance(60_000);
    expect(getActiveSession()?.state).toBe('READING');
    native.finishRead({ ok: true, card });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    await expect(promise).resolves.toMatchObject({ status: 'success' });
  });
});

describe('retentativa (E5-H3)', () => {
  async function failOnce() {
    native.tap();
    await flush();
    native.finishRead({ ok: false, code: 'CARD_REMOVED', detail: '' });
    await flush();
  }

  it('RN-07 / RN-09: cartão afastado volta a aguardar com timer reiniciado e lê na próxima aproximação', async () => {
    const seen = states();
    const promise = capture({ amountCents: 100 });
    await flush();
    await advance(20_000);
    await failOnce();
    expect(getActiveSession()?.state).toBe('RECOVERABLE_FAILURE');
    await advance(DEFAULT_DISPLAY_DURATIONS.recovery);
    expect(getActiveSession()?.state).toBe('WAITING_CARD');

    // RN-09: 25 s depois da retentativa ainda está aguardando (timer reiniciado).
    await advance(25_000);
    expect(getActiveSession()?.state).toBe('WAITING_CARD');

    native.tap();
    await flush();
    native.finishRead({ ok: true, card });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    const result = await promise;
    expect(result).toMatchObject({ status: 'success', meta: { attempts: 2 } });
    expect(seen.map((e) => e.state)).toContain('RECOVERABLE_FAILURE');
  });

  it('RN-08: maxRetries = 2 e 3 falhas → READ_FAILED_MAX_RETRIES', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    for (let i = 0; i < 3; i++) {
      await failOnce();
      await advance(DEFAULT_DISPLAY_DURATIONS.recovery);
    }
    expect(native.readerOn).toBe(false);
    await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    await expect(promise).resolves.toMatchObject({
      status: 'error',
      error: { code: 'READ_FAILED_MAX_RETRIES' },
      meta: { attempts: 3 },
    });
  });

  it('RN-08: maxRetries = 0 → erro na primeira falha', async () => {
    const promise = capture({ amountCents: 100, maxRetries: 0 });
    await flush();
    await failOnce();
    await advance(DEFAULT_DISPLAY_DURATIONS.recovery);
    await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    await expect(promise).resolves.toMatchObject({
      error: { code: 'READ_FAILED_MAX_RETRIES' },
      meta: { attempts: 1 },
    });
  });

  it('D017: cartão que sai e volta durante a leitura é lido de novo sem nova aproximação', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    native.tap(); // reaproximado enquanto a 1ª leitura ainda está em curso
    await flush();
    expect(native.readCard).toHaveBeenCalledTimes(1);
    native.finishRead({ ok: false, code: 'CARD_REMOVED', detail: '' });
    await flush();
    expect(native.readCard).toHaveBeenCalledTimes(2);
    native.finishRead({ ok: true, card });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    await expect(promise).resolves.toMatchObject({
      status: 'success',
      meta: { attempts: 2 },
    });
  });

  it('erro fatal (bandeira não suportada) não tenta de novo', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    native.finishRead({ ok: false, code: 'UNSUPPORTED_BRAND', detail: '' });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    await expect(promise).resolves.toMatchObject({
      status: 'error',
      error: { code: 'UNSUPPORTED_BRAND' },
    });
    expect(native.readCard).toHaveBeenCalledTimes(1);
  });
});

describe('cancelamento (E5-H4)', () => {
  it('RN-10: em WAITING_CARD encerra na hora e desliga o rádio', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    cancel();
    await flush();
    expect(native.readerOn).toBe(false);
    await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('RN-10: em READING é aceito, pede cancelamento ao nativo e só efetiva quando a leitura termina', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    cancel();
    await flush();
    expect(native.cancelReads).toBe(1);
    expect(getActiveSession()?.state).toBe('READING');
    expect(native.readerOn).toBe(true);

    native.finishRead({ ok: false, code: 'CANCELLED_BY_USER', detail: '' });
    await flush();
    expect(native.readerOn).toBe(false);
    await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('INV-3: a promise resolve uma única vez mesmo com eventos tardios', async () => {
    const promise = capture({ amountCents: 100 });
    const settled = jest.fn();
    promise.then(settled);
    await flush();
    cancel();
    cancel();
    native.tap();
    await flush();
    await advance(60_000);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('cancelar sem captura ativa não faz nada', () => {
    expect(() => cancel()).not.toThrow();
  });
});

describe('eventos para a UI e para o integrador', () => {
  it('onStateChange informa estado anterior, captureId e tentativas; para após remover', async () => {
    const listener = jest.fn();
    const unsubscribe = onStateChange(listener);
    const promise = capture({ amountCents: 100 });
    await flush();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'WAITING_CARD',
        previous: 'CHECKING',
        attempts: 0,
        captureId: expect.stringMatching(/^ct_/),
      })
    );
    unsubscribe();
    listener.mockClear();
    cancel();
    await flush();
    await promise;
    expect(listener).not.toHaveBeenCalled();
  });

  it('erro aparece no evento de estado ERROR', async () => {
    native.startResult = { ok: false, code: 'NFC_UNSUPPORTED', detail: '' };
    const seen = states();
    await Promise.all([capture({ amountCents: 100 }), flush()]);
    await flush();
    expect(seen.find((e) => e.state === 'ERROR')?.error?.code).toBe(
      'NFC_UNSUPPORTED'
    );
  });

  it('subscribeActiveSession recebe a sessão e depois null', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeActiveSession(listener);
    const promise = capture({ amountCents: 777 });
    await flush();
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ amountCents: 777 }),
      })
    );
    cancel();
    await flush();
    await promise;
    expect(listener).toHaveBeenLastCalledWith(null);
    unsubscribe();
  });

  it('RN-22: depois de resolver, nenhum dado do cartão fica na sessão', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    native.finishRead({ ok: true, card });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    await promise;
    expect(JSON.stringify(getActiveSession())).not.toContain(card.pan);
  });
});

describe('integração com a UI e diagnóstico', () => {
  it('sem CashTapProvider montado, capture() rejeita como erro de integração', async () => {
    __setDepsForTests({ native }, { requireUiHost: true });
    await expect(capture({ amountCents: 100 })).rejects.toThrow(
      /CashTapProvider/
    );
    const unregister = registerUiHost();
    const promise = capture({ amountCents: 100 });
    await flush();
    cancel();
    await flush();
    await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
    unregister();
    await expect(capture({ amountCents: 100 })).rejects.toThrow(
      /CashTapProvider/
    );
  });

  it('diagnostics: true registra transições e desfecho da captura', async () => {
    const promise = capture({ amountCents: 100, diagnostics: true });
    await flush();
    native.tap();
    await flush();
    native.diagnosticListeners.forEach((l) =>
      l({
        step: 'SELECT_PPSE',
        command: '00A4',
        response: '6F00',
        sw: '9000',
        durationMs: 20,
      })
    );
    native.finishRead({ ok: true, card });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    const result = await promise;
    const report = getLastDiagnostics();
    expect(report?.exchanges).toHaveLength(1);
    expect(native.diagnosticListeners.size).toBe(0);
    expect(report?.captureId).toBe(result.meta.captureId);
    expect(report?.transitions.map((t) => t.state)).toEqual([
      'CHECKING',
      'WAITING_CARD',
      'READING',
      'PROCESSING',
      'SUCCESS',
      'IDLE',
    ]);
    expect(report?.outcome).toBe('success');
  });

  it('sem diagnostics, nada é registrado', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    cancel();
    await flush();
    await promise;
    expect(getLastDiagnostics()).toBeNull();
  });
});

describe('robustez do runner (D018)', () => {
  it('exceção em listener do integrador não trava o ciclo nem o SDK', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    onStateChange(() => {
      throw new Error('bug do app');
    });
    const first = capture({ amountCents: 100 });
    await flush();
    cancel();
    await flush();
    await expect(first).resolves.toMatchObject({ status: 'cancelled' });
    expect(native.readerOn).toBe(false);

    const second = capture({ amountCents: 100 });
    await flush();
    expect(getActiveSession()?.state).toBe('WAITING_CARD');
    cancel();
    await flush();
    await expect(second).resolves.toMatchObject({ status: 'cancelled' });
    error.mockRestore();
  });

  it('startReaderMode rejeitando vira ERROR UNKNOWN e resolve', async () => {
    native.startReaderMode.mockRejectedValueOnce(new Error('boom'));
    const promise = capture({ amountCents: 100 });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    await expect(promise).resolves.toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN' },
    });
  });

  it('readCard rejeitando vira ERROR UNKNOWN e resolve', async () => {
    native.readCard.mockRejectedValueOnce(new Error('boom'));
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    await expect(promise).resolves.toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN' },
    });
    expect(native.readerOn).toBe(false);
  });

  it('moeda numérica vinda de JS sem tipos é rejeitada antes do rádio', async () => {
    const result = await capture({
      amountCents: 100,
      currencyCode: 986 as unknown as string,
    });
    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'INVALID_AMOUNT' },
    });
    expect(native.startReaderMode).not.toHaveBeenCalled();
  });

  it('reentrância: cancel() chamado por listener ao entrar em READING mantém ordem e efeitos', async () => {
    const seen: string[] = [];
    onStateChange((e) => {
      seen.push(e.state);
      if (e.state === 'READING') cancel();
    });
    const late: string[] = [];
    onStateChange((e) => late.push(e.state));
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    // a leitura começou antes do pedido de cancelamento (RN-10)
    expect(native.readCard.mock.invocationCallOrder[0]!).toBeLessThan(
      native.cancelRead.mock.invocationCallOrder[0]!
    );
    native.finishRead({ ok: false, code: 'CANCELLED_BY_USER', detail: '' });
    await flush();
    await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
    // todos os listeners veem a mesma ordem
    expect(late).toEqual(seen);
    expect(seen.indexOf('READING')).toBeLessThan(seen.indexOf('CANCELLED'));
  });

  it('falha ao assinar o diagnóstico rejeita sem deixar o SDK preso em ALREADY_RUNNING', async () => {
    jest.spyOn(native, 'onDiagnostic').mockImplementationOnce(() => {
      throw new Error('LINKING_ERROR');
    });
    await expect(
      capture({ amountCents: 100, diagnostics: true })
    ).rejects.toThrow('LINKING_ERROR');
    const next = capture({ amountCents: 100 });
    await flush();
    expect(getActiveSession()?.state).toBe('WAITING_CARD');
    cancel();
    await flush();
    await next;
  });

  it('D018: NFC desligado durante a espera vai para ERROR(NFC_DISABLED) e volta ao ligar', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    native.setNfc('DISABLED');
    await flush();
    expect(getActiveSession()).toMatchObject({
      state: 'ERROR',
      error: { code: 'NFC_DISABLED' },
    });
    expect(native.readerOn).toBe(false);
    native.setNfc('READY');
    await flush();
    expect(getActiveSession()?.state).toBe('WAITING_CARD');
    cancel();
    await flush();
    await promise;
  });

  it('D018: cancelar em PROCESSING não desfaz uma leitura concluída', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    native.finishRead({ ok: true, card });
    await Promise.resolve();
    await Promise.resolve();
    expect(getActiveSession()?.state).toBe('PROCESSING');
    cancel();
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    await expect(promise).resolves.toMatchObject({ status: 'success' });
  });

  it('RN-24: nenhuma view publicada para a UI contém o PAN completo', async () => {
    const views: unknown[] = [];
    subscribeActiveSession((view) => views.push(view));
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    native.finishRead({ ok: true, card });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    await promise;
    const all = JSON.stringify(views);
    expect(views.length).toBeGreaterThan(4);
    expect(all).not.toContain(card.pan);
    expect(all).toContain(card.panMasked);
  });

  it('getActiveSession devolve a mesma referência enquanto nada muda (useSyncExternalStore)', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    expect(getActiveSession()).toBe(getActiveSession());
    cancel();
    await flush();
    await promise;
  });

  it('D018: duração da falha vai até o desfecho, sem o tempo da tela final', async () => {
    const promise = capture({ amountCents: 100, timeoutMs: 10_000 });
    await flush();
    await advance(10_000);
    await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    const result = await promise;
    expect(result.meta.durationMs).toBe(10_000);
  });

  it('t_ciclo é medido a partir da leitura que teve sucesso, mesmo com tag pendente', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    clock += 100;
    native.tap(); // tag pendente
    await flush();
    clock += 400;
    native.finishRead({ ok: false, code: 'CARD_REMOVED', detail: '' });
    await flush();
    clock += 200;
    native.finishRead({ ok: true, card });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    const result = await promise;
    expect(result.meta.readDurationMs).toBe(200);
  });
});

describe('falhas síncronas do nativo (D018)', () => {
  it('startReaderMode lançando de forma síncrona vira ERROR UNKNOWN', async () => {
    native.startReaderMode.mockImplementationOnce(() => {
      throw new Error('sync');
    });
    const promise = capture({ amountCents: 100 });
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    await expect(promise).resolves.toMatchObject({
      error: { code: 'UNKNOWN' },
    });
  });

  it('readCard lançando de forma síncrona vira ERROR UNKNOWN', async () => {
    native.readCard.mockImplementationOnce(() => {
      throw new Error('sync');
    });
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    await expect(promise).resolves.toMatchObject({
      error: { code: 'UNKNOWN' },
    });
  });

  it('cancelRead lançando não impede o cancelamento de seguir', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    native.cancelRead.mockImplementationOnce(() => {
      throw new Error('sync');
    });
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    cancel();
    native.finishRead({ ok: true, card });
    await flush();
    await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
    error.mockRestore();
  });

  it('falha ao assinar eventos do nativo rejeita e libera o SDK', async () => {
    jest.spyOn(native, 'onTagDetected').mockImplementationOnce(() => {
      throw new Error('LINKING_ERROR');
    });
    await expect(capture({ amountCents: 100 })).rejects.toThrow(
      'LINKING_ERROR'
    );
    const next = capture({ amountCents: 100 });
    await flush();
    expect(getActiveSession()?.state).toBe('WAITING_CARD');
    cancel();
    await flush();
    await next;
  });
});

describe('projeção para a UI acompanha o contexto', () => {
  it('RN-10: cancelar em READING publica cancelRequested=true na view, sem novo evento de estado', async () => {
    const stateEvents = jest.fn();
    onStateChange(stateEvents);
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    stateEvents.mockClear();
    cancel();
    expect(getActiveSession()).toMatchObject({
      state: 'READING',
      cancelRequested: true,
    });
    expect(stateEvents).not.toHaveBeenCalled();
    native.finishRead({ ok: false, code: 'CANCELLED_BY_USER', detail: '' });
    await flush();
    await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('NFC desligado durante a leitura: interrompe e termina em ERROR(NFC_DISABLED), não em TIMEOUT', async () => {
    const promise = capture({ amountCents: 100 });
    await flush();
    native.tap();
    await flush();
    native.setNfc('DISABLED');
    await flush();
    expect(native.cancelRead).toHaveBeenCalled();
    native.finishRead({ ok: false, code: 'CANCELLED_BY_USER', detail: '' });
    await flush();
    expect(getActiveSession()).toMatchObject({
      state: 'ERROR',
      error: { code: 'NFC_DISABLED' },
    });
    cancel();
    await flush();
    await expect(promise).resolves.toMatchObject({
      error: { code: 'NFC_DISABLED' },
    });
  });
});
