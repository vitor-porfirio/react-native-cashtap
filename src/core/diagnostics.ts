import type { DiagnosticExchange } from '../native';
import type { CaptureResult, StepTiming, Unsubscribe } from '../types';
import type { CaptureState } from './machine';

/**
 * Registro da última captura feita com `diagnostics: true` (E7-H3).
 * Só contém dados já mascarados na origem: nunca o PAN completo nem o criptograma.
 */
export type DiagnosticsReport = {
  captureId: string;
  startedAt: number;
  transitions: Array<{ state: CaptureState; atMs: number }>;
  exchanges: Array<DiagnosticExchange & { atMs: number }>;
  outcome?: CaptureResult['status'];
  errorCode?: string;
  stepTimings: StepTiming[];
  readDurationMs?: number;
  cryptogramPresent?: boolean;
};

let current: DiagnosticsReport | null = null;
let origin = 0;
const listeners = new Set<(report: DiagnosticsReport | null) => void>();

function emit() {
  const snapshot = current && { ...current };
  listeners.forEach((listener) => listener(snapshot));
}

export const diagnosticsRecorder = {
  start(captureId: string, startedAt: number, now: number) {
    origin = now;
    current = {
      captureId,
      startedAt,
      transitions: [],
      exchanges: [],
      stepTimings: [],
    };
    emit();
  },
  transition(state: CaptureState, now: number) {
    if (!current) return;
    current = {
      ...current,
      transitions: [...current.transitions, { state, atMs: now - origin }],
    };
    emit();
  },
  exchange(exchange: DiagnosticExchange, now: number) {
    if (!current) return;
    current = {
      ...current,
      exchanges: [...current.exchanges, { ...exchange, atMs: now - origin }],
    };
    emit();
  },
  finish(result: CaptureResult) {
    if (!current) return;
    current = {
      ...current,
      outcome: result.status,
      ...('error' in result && { errorCode: result.error.code }),
      stepTimings: result.meta.stepTimings,
      readDurationMs: result.meta.readDurationMs,
      cryptogramPresent: result.meta.cryptogramPresent,
    };
    emit();
  },
  reset() {
    current = null;
    emit();
  },
};

/** Último relatório de diagnóstico, ou `null` se nenhuma captura usou `diagnostics`. */
export function getLastDiagnostics(): DiagnosticsReport | null {
  return current;
}

export function onDiagnosticsChange(
  listener: (report: DiagnosticsReport | null) => void
): Unsubscribe {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Texto para exportar/compartilhar (anexar em issue, colar no emvlab). */
export function diagnosticsToText(report: DiagnosticsReport): string {
  const lines = [
    `captura ${report.captureId} — início ${new Date(report.startedAt).toISOString()}`,
    `desfecho: ${report.outcome ?? 'em andamento'}${report.errorCode ? ` (${report.errorCode})` : ''}`,
    `criptograma retornado: ${report.cryptogramPresent === undefined ? '—' : report.cryptogramPresent ? 'sim' : 'não'}`,
    '',
    'transições:',
    ...report.transitions.map((t) => `  +${t.atMs.toFixed(0)} ms  ${t.state}`),
    '',
    'etapas:',
    ...report.stepTimings.map(
      (s) => `  ${s.step}: ${s.durationMs.toFixed(1)} ms`
    ),
    '',
    'comandos (respostas mascaradas):',
    ...report.exchanges.flatMap((e) => [
      `  +${e.atMs.toFixed(0)} ms  ${e.step}  SW ${e.sw}  ${e.durationMs.toFixed(1)} ms`,
      `    > ${e.command}`,
      `    < ${e.response}`,
    ]),
  ];
  return lines.join('\n');
}
