import type { DiagnosticExchange } from '../native';
import type { CaptureResult, EmvStep, StepTiming, Unsubscribe } from '../types';
import type { CaptureState } from './machine';

/**
 * Troca de comando com o cartão, como aparece no relatório. Tipo público próprio,
 * desacoplado do contrato do Turbo Module: mudar a ponte não quebra o integrador.
 */
export type DiagnosticsExchange = {
  step: EmvStep;
  /** Comando enviado, em hexadecimal. Só carrega dados do terminal. */
  command: string;
  /** Resposta do cartão, já mascarada na origem (allowlist, D016). */
  response: string;
  sw: string;
  durationMs: number;
  /** Instante relativo ao início da captura. */
  atMs: number;
};

/**
 * Registro da última captura feita com `diagnostics: true` (E7-H3).
 * Só contém dados já mascarados na origem: nunca o PAN completo nem o criptograma.
 */
export type DiagnosticsReport = {
  captureId: string;
  startedAt: number;
  transitions: Array<{ state: CaptureState; atMs: number }>;
  exchanges: DiagnosticsExchange[];
  outcome?: CaptureResult['status'];
  errorCode?: string;
  stepTimings: StepTiming[];
  /** Duração total da captura (t_total). */
  durationMs?: number;
  /** Da detecção do cartão ao resultado da leitura (t_ciclo). */
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
      exchanges: [
        ...current.exchanges,
        {
          step: exchange.step,
          command: exchange.command,
          response: exchange.response,
          sw: exchange.sw,
          durationMs: exchange.durationMs,
          atMs: now - origin,
        },
      ],
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
      durationMs: result.meta.durationMs,
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
    `tempo total: ${report.durationMs === undefined ? '—' : `${report.durationMs.toFixed(0)} ms`} · leitura: ${report.readDurationMs === undefined ? '—' : `${report.readDurationMs.toFixed(0)} ms`}`,
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
