import { describe, expect, it } from '@jest/globals';
import { createError } from '../../errors';
import type { CaptureMeta, CaptureResult } from '../../types';
import {
  MEASUREMENT_COLUMNS,
  measurementsToCsv,
  toMeasurementRow,
} from '../measurements';

const meta: CaptureMeta = {
  captureId: 'ct_1',
  startedAt: 0,
  durationMs: 2345.678,
  attempts: 1,
  readDurationMs: 412.34,
  stepTimings: [
    { step: 'SELECT_PPSE', durationMs: 20.04 },
    { step: 'SELECT_AID', durationMs: 15 },
    { step: 'GET_PROCESSING_OPTIONS', durationMs: 90.06 },
    { step: 'READ_RECORD', durationMs: 35 },
  ],
  cryptogramPresent: true,
};

const success: CaptureResult = {
  status: 'success',
  card: {
    pan: '4761739001010010',
    panMasked: '476173******0010',
    expiry: '2512',
    brand: 'visa',
    aid: 'A0000000031010',
  },
  meta,
};

describe('medições (E8-H2, Apêndice B)', () => {
  it('sucesso na 1ª leitura: tempos por etapa arredondados a 0,1 ms', () => {
    expect(toMeasurementRow(success)).toEqual({
      captureId: 'ct_1',
      outcome: 'sucesso',
      category: '',
      brand: 'visa',
      attempts: 1,
      t_ciclo: 412.3,
      t_total: 2345.7,
      t_ppse: 20,
      t_aid: 15,
      t_gpo: 90.1,
      t_read: 35,
    });
  });

  it('sucesso após retentativa automática é "recuperado"', () => {
    const row = toMeasurementRow({
      ...success,
      meta: { ...meta, attempts: 2 },
    });
    expect(row.outcome).toBe('recuperado');
  });

  const bare: CaptureMeta = {
    ...meta,
    stepTimings: [],
    readDurationMs: undefined,
  };
  const failures: Array<[CaptureResult, string, string]> = [
    [
      {
        status: 'error',
        error: createError('READ_FAILED_MAX_RETRIES'),
        meta: bare,
      },
      'falha',
      'READ_FAILED_MAX_RETRIES',
    ],
    [
      { status: 'timeout', error: createError('TIMEOUT'), meta: bare },
      'expirado',
      'TIMEOUT',
    ],
    [{ status: 'cancelled', meta: bare }, 'cancelado', ''],
  ];

  it.each(failures)('desfecho %#: vira %s', (result, outcome, category) => {
    expect(toMeasurementRow(result)).toMatchObject({
      outcome,
      category,
      brand: '',
      t_ciclo: null,
      t_ppse: null,
    });
  });

  it('nenhuma coluna carrega o PAN (RN-23)', () => {
    const csv = measurementsToCsv([toMeasurementRow(success)]);
    expect(csv).not.toContain(
      success.status === 'success' ? success.card.pan : 'x'
    );
  });

  it('CSV com cabeçalho, colunas extras à esquerda e campos vazios para null', () => {
    const error: CaptureResult = {
      status: 'error',
      error: createError('UNSUPPORTED_BRAND'),
      meta: { ...meta, stepTimings: [], readDurationMs: undefined },
    };
    const csv = measurementsToCsv(
      [
        { ...toMeasurementRow(success), sessao: 1 },
        { ...toMeasurementRow(error), sessao: 2 },
      ],
      ['sessao']
    );
    const [header, first, second] = csv.split('\n');
    expect(header).toBe(['sessao', ...MEASUREMENT_COLUMNS].join(','));
    expect(first).toBe('1,ct_1,sucesso,,visa,1,412.3,2345.7,20,15,90.1,35');
    expect(second).toBe('2,ct_1,falha,UNSUPPORTED_BRAND,,1,,2345.7,,,,');
  });

  it('escapa vírgula e aspas', () => {
    const csv = measurementsToCsv(
      [{ ...toMeasurementRow(success), nota: 'a, "b"' }],
      ['nota']
    );
    expect(csv.split('\n')[1]?.startsWith('"a, ""b"""')).toBe(true);
  });
});
