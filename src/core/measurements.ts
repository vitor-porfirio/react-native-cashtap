import type { ErrorCode } from '../errors';
import type { CaptureResult, CardBrand } from '../types';

/**
 * Linha de medição de uma captura, no formato do Apêndice B do TCC
 * (E8-H2: tempos por etapa exportáveis em formato tabular).
 */
export type MeasurementOutcome =
  'sucesso' | 'recuperado' | 'falha' | 'cancelado' | 'expirado';

export type MeasurementRow = {
  captureId: string;
  outcome: MeasurementOutcome;
  /** Código do erro do catálogo, ou vazio. */
  category: ErrorCode | '';
  brand: CardBrand | '';
  attempts: number;
  t_ciclo: number | null;
  t_total: number;
  t_ppse: number | null;
  t_aid: number | null;
  t_gpo: number | null;
  t_read: number | null;
};

export const MEASUREMENT_COLUMNS: Array<keyof MeasurementRow> = [
  'captureId',
  'outcome',
  'category',
  'brand',
  'attempts',
  't_ciclo',
  't_total',
  't_ppse',
  't_aid',
  't_gpo',
  't_read',
];

const round = (value: number | undefined): number | null =>
  value === undefined ? null : Math.round(value * 10) / 10;

/** Desfecho no vocabulário do TCC: sucesso na 1ª leitura, recuperado após retentativa, ou falha. */
function outcomeLabel(result: CaptureResult): MeasurementOutcome {
  switch (result.status) {
    case 'success':
      return result.meta.attempts > 1 ? 'recuperado' : 'sucesso';
    case 'cancelled':
      return 'cancelado';
    case 'timeout':
      return 'expirado';
    case 'error':
      return 'falha';
  }
}

export function toMeasurementRow(result: CaptureResult): MeasurementRow {
  const step = (name: string) =>
    round(result.meta.stepTimings.find((s) => s.step === name)?.durationMs);
  return {
    captureId: result.meta.captureId,
    outcome: outcomeLabel(result),
    category: 'error' in result ? result.error.code : '',
    brand: result.status === 'success' ? result.card.brand : '',
    attempts: result.meta.attempts,
    t_ciclo: round(result.meta.readDurationMs),
    t_total: Math.round(result.meta.durationMs * 10) / 10,
    t_ppse: step('SELECT_PPSE'),
    t_aid: step('SELECT_AID'),
    t_gpo: step('GET_PROCESSING_OPTIONS'),
    t_read: step('READ_RECORD'),
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV com cabeçalho. `extra` acrescenta colunas do app (ex.: sessão do ensaio)
 * à esquerda. Nenhuma coluna contém PAN.
 */
export function measurementsToCsv(
  rows: Array<MeasurementRow & Record<string, unknown>>,
  extraColumns: string[] = []
): string {
  const columns = [...extraColumns, ...MEASUREMENT_COLUMNS];
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  return lines.join('\n');
}
