import type { ErrorCode } from '../errors';
import type { CaptureResult, CardBrand } from '../types';

/**
 * Desfecho de uma captura para os ensaios: `success` na 1ª leitura, `recovered` após
 * retentativa automática, ou falha.
 */
export type MeasurementOutcome =
  'success' | 'recovered' | 'failure' | 'cancelled' | 'timeout';

/** Linha de medição de uma captura (E8-H2). Tempos em ms, com uma casa decimal. */
export type MeasurementRow = {
  captureId: string;
  outcome: MeasurementOutcome;
  /** Código do erro do catálogo, ou vazio. */
  errorCode: ErrorCode | '';
  brand: CardBrand | '';
  attempts: number;
  /** Do `capture()` à detecção do cartão lido com sucesso (t_deteccao). */
  detectionMs: number | null;
  /** Da detecção do cartão ao resultado da leitura (t_ciclo). */
  readMs: number | null;
  /** Do `capture()` ao desfecho (t_total). */
  totalMs: number;
  ppseMs: number | null;
  aidMs: number | null;
  gpoMs: number | null;
  readRecordMs: number | null;
};

/**
 * Colunas do CSV, com os rótulos do formulário de ensaios (Apêndice B do TCC).
 * Os identificadores da API ficam em inglês (D006); só o arquivo exportado usa o vocabulário do TCC.
 */
export const MEASUREMENT_COLUMNS: ReadonlyArray<
  readonly [keyof MeasurementRow, string]
> = Object.freeze([
  ['captureId', 'captura'],
  ['outcome', 'desfecho'],
  ['errorCode', 'categoria'],
  ['brand', 'bandeira'],
  ['attempts', 'tentativas'],
  ['detectionMs', 't_deteccao'],
  ['readMs', 't_ciclo'],
  ['totalMs', 't_total'],
  ['ppseMs', 't_ppse'],
  ['aidMs', 't_aid'],
  ['gpoMs', 't_gpo'],
  ['readRecordMs', 't_read'],
] as const);

const OUTCOME_CSV: Record<MeasurementOutcome, string> = {
  success: 'sucesso',
  recovered: 'recuperado',
  failure: 'falha',
  cancelled: 'cancelado',
  timeout: 'expirado',
};

const round = (value: number | undefined): number | null =>
  value === undefined ? null : Math.round(value * 10) / 10;

function outcomeOf(result: CaptureResult): MeasurementOutcome {
  switch (result.status) {
    case 'success':
      return result.meta.attempts > 1 ? 'recovered' : 'success';
    case 'cancelled':
      return 'cancelled';
    case 'timeout':
      return 'timeout';
    case 'error':
      return 'failure';
  }
}

export function toMeasurementRow(result: CaptureResult): MeasurementRow {
  const step = (name: string) =>
    round(result.meta.stepTimings.find((s) => s.step === name)?.durationMs);
  return {
    captureId: result.meta.captureId,
    outcome: outcomeOf(result),
    errorCode: 'error' in result ? result.error.code : '',
    brand: result.status === 'success' ? result.card.brand : '',
    attempts: result.meta.attempts,
    detectionMs: round(result.meta.detectionMs),
    readMs: round(result.meta.readDurationMs),
    totalMs: Math.round(result.meta.durationMs * 10) / 10,
    ppseMs: step('SELECT_PPSE'),
    aidMs: step('SELECT_AID'),
    gpoMs: step('GET_PROCESSING_OPTIONS'),
    readRecordMs: step('READ_RECORD'),
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV com cabeçalho no formato do Apêndice B. `extraColumns` acrescenta colunas do app
 * (ex.: sessão do ensaio) à esquerda, com o próprio nome como cabeçalho. Nenhuma coluna contém PAN.
 */
export function measurementsToCsv(
  rows: ReadonlyArray<MeasurementRow & Record<string, unknown>>,
  extraColumns: readonly string[] = []
): string {
  const header = [
    ...extraColumns,
    ...MEASUREMENT_COLUMNS.map(([, label]) => label),
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    const cells = [
      ...extraColumns.map((column) => csvCell(row[column])),
      ...MEASUREMENT_COLUMNS.map(([key]) =>
        csvCell(key === 'outcome' ? OUTCOME_CSV[row.outcome] : row[key])
      ),
    ];
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}
