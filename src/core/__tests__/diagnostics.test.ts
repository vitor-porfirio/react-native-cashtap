import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createError } from '../../errors';
import type { CaptureResult } from '../../types';
import {
  diagnosticsRecorder,
  diagnosticsToText,
  getLastDiagnostics,
  onDiagnosticsChange,
} from '../diagnostics';

const exchange = {
  step: 'SELECT_PPSE' as const,
  command: '00A404000E325041592E5359532E444446303100',
  response:
    '6F23840E325041592E5359532E4444463031A511BF0C0E610C4F07A0000000031010870101',
  sw: '9000',
  durationMs: 21.5,
};

describe('diagnóstico (E7-H3)', () => {
  beforeEach(() => diagnosticsRecorder.reset());

  it('registra transições e trocas com tempo relativo ao início, em ordem', () => {
    diagnosticsRecorder.start('ct_1', 1_795_000_000_000, 1000);
    diagnosticsRecorder.transition('CHECKING', 1000);
    diagnosticsRecorder.transition('WAITING_CARD', 1040);
    diagnosticsRecorder.exchange(exchange, 1300);
    const report = getLastDiagnostics();
    expect(report?.transitions).toEqual([
      { state: 'CHECKING', atMs: 0 },
      { state: 'WAITING_CARD', atMs: 40 },
    ]);
    expect(report?.exchanges).toEqual([{ ...exchange, atMs: 300 }]);
  });

  it('ao terminar guarda desfecho, tempos e presença do criptograma — nunca o PAN', () => {
    diagnosticsRecorder.start('ct_1', 0, 0);
    const result: CaptureResult = {
      status: 'success',
      card: {
        pan: '4761739001010010',
        panMasked: '476173******0010',
        expiry: '2512',
        brand: 'visa',
        aid: 'A0000000031010',
      },
      meta: {
        captureId: 'ct_1',
        startedAt: 0,
        durationMs: 900,
        attempts: 1,
        readDurationMs: 400,
        stepTimings: [{ step: 'SELECT_PPSE', durationMs: 21.5 }],
        cryptogramPresent: true,
      },
    };
    diagnosticsRecorder.finish(result);
    const report = getLastDiagnostics();
    expect(report).toMatchObject({
      outcome: 'success',
      readDurationMs: 400,
      cryptogramPresent: true,
    });
    expect(JSON.stringify(report)).not.toContain('4761739001010010');
  });

  it('desfecho de erro registra o código', () => {
    diagnosticsRecorder.start('ct_2', 0, 0);
    diagnosticsRecorder.finish({
      status: 'error',
      error: createError('UNSUPPORTED_BRAND'),
      meta: {
        captureId: 'ct_2',
        startedAt: 0,
        durationMs: 1,
        attempts: 1,
        stepTimings: [],
      },
    });
    expect(getLastDiagnostics()).toMatchObject({
      outcome: 'error',
      errorCode: 'UNSUPPORTED_BRAND',
    });
  });

  it('sem captura iniciada, transições e trocas são ignoradas', () => {
    diagnosticsRecorder.transition('CHECKING', 1);
    diagnosticsRecorder.exchange(exchange, 1);
    diagnosticsRecorder.finish({
      status: 'cancelled',
      meta: {
        captureId: 'x',
        startedAt: 0,
        durationMs: 0,
        attempts: 0,
        stepTimings: [],
      },
    });
    expect(getLastDiagnostics()).toBeNull();
  });

  it('notifica assinantes e para após remover', () => {
    const listener = jest.fn();
    const unsubscribe = onDiagnosticsChange(listener);
    diagnosticsRecorder.start('ct_3', 0, 0);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ captureId: 'ct_3' })
    );
    unsubscribe();
    listener.mockClear();
    diagnosticsRecorder.transition('CHECKING', 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('exporta texto com etapas, comandos e presença do criptograma', () => {
    diagnosticsRecorder.start('ct_4', 0, 0);
    diagnosticsRecorder.transition('READING', 10);
    diagnosticsRecorder.exchange(exchange, 20);
    const text = diagnosticsToText(getLastDiagnostics()!);
    expect(text).toContain('ct_4');
    expect(text).toContain('+10 ms  READING');
    expect(text).toContain('SELECT_PPSE  SW 9000');
    expect(text).toContain(`> ${exchange.command}`);
    expect(text).toContain('criptograma retornado: —');
    expect(text).toContain('desfecho: em andamento');
  });

  it('exporta desfecho com código de erro e criptograma sim/não', () => {
    diagnosticsRecorder.start('ct_5', 0, 0);
    diagnosticsRecorder.finish({
      status: 'error',
      error: createError('INCOMPLETE_DATA'),
      meta: {
        captureId: 'ct_5',
        startedAt: 0,
        durationMs: 1,
        attempts: 1,
        stepTimings: [],
        cryptogramPresent: false,
      },
    });
    const text = diagnosticsToText(getLastDiagnostics()!);
    expect(text).toContain('desfecho: error (INCOMPLETE_DATA)');
  });
});
