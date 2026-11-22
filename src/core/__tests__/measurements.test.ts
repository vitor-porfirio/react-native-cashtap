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
  detectionMs: 1801.26,
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
      outcome: 'success',
      errorCode: '',
      brand: 'visa',
      attempts: 1,
      detectionMs: 1801.3,
      readMs: 412.3,
      totalMs: 2345.7,
      ppseMs: 20,
      aidMs: 15,
      gpoMs: 90.1,
      readRecordMs: 35,
    });
  });

  it('sucesso após retentativa automática é "recovered"', () => {
    const row = toMeasurementRow({
      ...success,
      meta: { ...meta, attempts: 2 },
    });
    expect(row.outcome).toBe('recovered');
  });

  const bare: CaptureMeta = {
    ...meta,
    stepTimings: [],
    readDurationMs: undefined,
    detectionMs: undefined,
  };
  const failures: Array<[CaptureResult, string, string]> = [
    [
      {
        status: 'error',
        error: createError('READ_FAILED_MAX_RETRIES'),
        meta: bare,
      },
      'failure',
      'READ_FAILED_MAX_RETRIES',
    ],
    [
      { status: 'timeout', error: createError('TIMEOUT'), meta: bare },
      'timeout',
      'TIMEOUT',
    ],
    [{ status: 'cancelled', meta: bare }, 'cancelled', ''],
  ];

  it.each(failures)('desfecho %#: vira %s', (result, outcome, errorCode) => {
    expect(toMeasurementRow(result)).toMatchObject({
      outcome,
      errorCode,
      brand: '',
      detectionMs: null,
      readMs: null,
      ppseMs: null,
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
      meta: {
        ...meta,
        stepTimings: [],
        readDurationMs: undefined,
        detectionMs: undefined,
      },
    };
    const csv = measurementsToCsv(
      [
        { ...toMeasurementRow(success), sessao: 1 },
        { ...toMeasurementRow(error), sessao: 2 },
      ],
      ['sessao']
    );
    const [header, first, second] = csv.split('\n');
    expect(header).toBe(
      'sessao,captura,desfecho,categoria,bandeira,tentativas,t_deteccao,t_ciclo,t_total,t_ppse,t_aid,t_gpo,t_read'
    );
    expect(MEASUREMENT_COLUMNS).toHaveLength(12);
    expect(first).toBe(
      '1,ct_1,sucesso,,visa,1,1801.3,412.3,2345.7,20,15,90.1,35'
    );
    expect(second).toBe('2,ct_1,falha,UNSUPPORTED_BRAND,,1,,,2345.7,,,,');
  });

  it('desfechos saem no vocabulário do Apêndice B no CSV', () => {
    const rows: CaptureResult[] = [
      { ...success, meta: { ...meta, attempts: 2 } },
      { status: 'cancelled', meta: bare },
      { status: 'timeout', error: createError('TIMEOUT'), meta: bare },
    ];
    const lines = measurementsToCsv(rows.map(toMeasurementRow)).split('\n');
    expect(lines.slice(1).map((l) => l.split(',')[1])).toEqual([
      'recuperado',
      'cancelado',
      'expirado',
    ]);
  });

  it('escapa vírgula e aspas', () => {
    const csv = measurementsToCsv(
      [{ ...toMeasurementRow(success), nota: 'a, "b"' }],
      ['nota']
    );
    expect(csv.split('\n')[1]?.startsWith('"a, ""b"""')).toBe(true);
  });
});
