import { createError } from '../errors';
import type {
  DiagnosticExchange,
  NativeCardRead,
  NativeFailure,
  NativeReadOutcome,
  StartErrorCode,
} from '../native';
import {
  EMV_STEPS,
  type CaptureMeta,
  type CaptureResult,
  type CardData,
  type NfcStatus,
  type Unsubscribe,
} from '../types';
import {
  initialSnapshot,
  isTerminal,
  transition,
  type CaptureState,
  type DelayKind,
  type Effect,
  type MachineEvent,
  type MachineSnapshot,
  type Outcome,
} from './machine';
import type { ResolvedParams } from './params';

/** O que a sessão precisa do nativo. Injetado para testar sem hardware (T18). */
export type NativePort = {
  startReaderMode(): Promise<{ ok: true } | NativeFailure<StartErrorCode>>;
  stopReaderMode(): Promise<void>;
  readCard(
    amountCents: number,
    currencyCode: string,
    diagnostics: boolean
  ): Promise<NativeReadOutcome>;
  cancelRead(): void;
  onTagDetected(listener: () => void): Unsubscribe;
  onNfcStatusChange(listener: (status: NfcStatus) => void): Unsubscribe;
  onDiagnostic(listener: (exchange: DiagnosticExchange) => void): Unsubscribe;
};

export type Clock = {
  /** Relógio monotônico em ms. */
  now(): number;
  /** Relógio de parede em ms (epoch). */
  epochMs(): number;
};

export type Timers = {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

/** Quanto tempo cada tela transitória fica visível antes de seguir. */
export type DisplayDurations = Record<Exclude<DelayKind, 'immediate'>, number>;

export const DEFAULT_DISPLAY_DURATIONS: DisplayDurations = {
  recovery: 1_500,
  success: 1_500,
  failure: 3_000,
};

export type SessionDeps = {
  native: NativePort;
  clock: Clock;
  timers: Timers;
  display: DisplayDurations;
};

export type SessionChange = {
  previous: CaptureState;
  snapshot: MachineSnapshot;
  /** `false` quando só o contexto mudou (ex.: cancelamento pedido em READING). */
  stateChanged: boolean;
  timestamp: number;
};

function reportListenerError(error: unknown): void {
  if (__DEV__) {
    console.error('react-native-cashtap: um listener lançou exceção', error);
  }
}

/**
 * Casca imperativa da máquina de estados: executa os efeitos pedidos por
 * `transition()` e garante que a Promise de `capture()` resolve uma vez (INV-3).
 *
 * Robustez (D018):
 * - eventos são processados em fila, um por vez, mesmo quando um listener ou
 *   efeito dispara outro evento (sem reentrância);
 * - os efeitos de um evento rodam antes de os listeners serem notificados;
 * - exceção em listener do integrador nunca interrompe o ciclo;
 * - falha inesperada de efeito ou do nativo vira erro `UNKNOWN` no fluxo.
 */
export class CaptureSession {
  private snapshot: MachineSnapshot;
  private waitTimer: unknown = null;
  private readonly scheduled = new Set<unknown>();
  private readonly subscriptions: Unsubscribe[] = [];
  private readonly queue: MachineEvent[] = [];
  private processing = false;
  private settle: ((result: CaptureResult) => void) | null = null;
  private settled = false;
  private startedAtMono = 0;
  private startedAtEpoch = 0;
  private readStartedAt: number | null = null;
  private readDurationMs: number | undefined;
  private outcomeAt: number | null = null;
  private readonly stepsDone = new Set<string>();

  constructor(
    readonly captureId: string,
    private readonly params: ResolvedParams,
    private readonly deps: SessionDeps,
    private readonly onChange: (change: SessionChange) => void
  ) {
    this.snapshot = initialSnapshot(params.maxRetries);
  }

  get current(): MachineSnapshot {
    return this.snapshot;
  }

  get settings(): Readonly<ResolvedParams> {
    return this.params;
  }

  /** Etapas do diálogo concluídas (SW 9000) na leitura atual, para a barra de progresso. */
  get progress(): number {
    return this.stepsDone.size;
  }

  start(): Promise<CaptureResult> {
    const promise = new Promise<CaptureResult>((resolve) => {
      this.settle = resolve;
    });
    this.startedAtMono = this.deps.clock.now();
    this.startedAtEpoch = this.deps.clock.epochMs();
    try {
      this.subscriptions.push(
        this.deps.native.onTagDetected(() =>
          this.dispatch({ type: 'TAG_DETECTED' })
        )
      );
      this.subscriptions.push(
        this.deps.native.onDiagnostic((exchange) => this.onProgress(exchange))
      );
      this.subscriptions.push(
        this.deps.native.onNfcStatusChange((status) => {
          if (status === 'READY') {
            // RN-02: operador ligou o NFC com a tela de "NFC desligado" aberta.
            this.dispatch({ type: 'RECHECK' });
          } else {
            // NFC desligado (ou some) com a captura aberta: não esperar o timeout.
            const code =
              status === 'DISABLED' ? 'NFC_DISABLED' : 'NFC_UNSUPPORTED';
            this.dispatch({
              type: 'NFC_UNAVAILABLE',
              error: createError(code),
            });
          }
        })
      );
    } catch (error) {
      this.dispose();
      throw error;
    }
    this.dispatch({ type: 'START' });
    return promise;
  }

  dispatch(event: MachineEvent): void {
    if (this.settled) return;
    this.queue.push(event);
    if (this.processing) return;
    this.processing = true;
    try {
      let next = this.queue.shift();
      while (next && !this.settled) {
        this.process(next);
        next = this.queue.shift();
      }
    } finally {
      this.queue.length = 0;
      this.processing = false;
    }
  }

  private process(event: MachineEvent): void {
    const previous = this.snapshot.state;
    const { snapshot, effects, changed } = transition(this.snapshot, event);
    if (!changed) return;
    this.snapshot = snapshot;
    const stateChanged = snapshot.state !== previous;
    if (stateChanged) {
      // Eventos agendados para o estado anterior não valem mais.
      this.clearScheduled();
      this.trackTimes(snapshot.state);
    }
    for (const effect of effects) {
      this.runSafely(effect);
    }
    try {
      this.onChange({
        previous,
        snapshot,
        stateChanged,
        timestamp: this.deps.clock.now(),
      });
    } catch (error) {
      reportListenerError(error);
    }
  }

  private onProgress(exchange: DiagnosticExchange): void {
    if (this.settled || this.snapshot.state !== 'READING') return;
    if (exchange.sw !== '9000' || this.stepsDone.has(exchange.step)) return;
    this.stepsDone.add(exchange.step);
    try {
      this.onChange({
        previous: this.snapshot.state,
        snapshot: this.snapshot,
        stateChanged: false,
        timestamp: this.deps.clock.now(),
      });
    } catch (error) {
      reportListenerError(error);
    }
  }

  private trackTimes(state: CaptureState): void {
    const now = this.deps.clock.now();
    if (state === 'READING') {
      this.readStartedAt = now;
      this.stepsDone.clear();
    }
    // Duração da captura vai até o desfecho, sem o tempo de exibição da tela final.
    if (isTerminal(state)) this.outcomeAt = now;
  }

  private runSafely(effect: Effect): void {
    try {
      this.run(effect);
    } catch (error) {
      this.failUnexpectedly(effect, error);
    }
  }

  /** Falha que não deveria acontecer: vira erro do catálogo em vez de travar o ciclo. */
  private failUnexpectedly(effect: Effect, error: unknown): void {
    const detail = `${effect.type}: ${error instanceof Error ? error.name : 'erro'}`;
    if (effect.type === 'START_READER') {
      this.dispatch({
        type: 'NFC_UNAVAILABLE',
        error: createError('UNKNOWN', detail),
      });
    } else if (effect.type === 'READ_CARD') {
      this.dispatch({
        type: 'READ_FAILED',
        error: createError('UNKNOWN', detail),
      });
    } else if (effect.type === 'RESOLVE') {
      // INV-3 também no caminho que não deveria acontecer: resolve com UNKNOWN.
      this.settled = true;
      this.dispose();
      this.settle?.({
        status: 'error',
        error: createError('UNKNOWN', detail),
        meta: {
          captureId: this.captureId,
          startedAt: this.startedAtEpoch,
          durationMs: this.deps.clock.now() - this.startedAtMono,
          attempts: this.snapshot.context.attempts,
          stepTimings: [],
        },
      });
    } else {
      reportListenerError(error);
    }
  }

  private run(effect: Effect): void {
    const { native, timers } = this.deps;
    switch (effect.type) {
      case 'START_READER':
        native.startReaderMode().then(
          (result) =>
            this.dispatch(
              result.ok
                ? { type: 'NFC_READY' }
                : {
                    type: 'NFC_UNAVAILABLE',
                    error: createError(result.code, result.detail),
                  }
            ),
          () =>
            this.dispatch({
              type: 'NFC_UNAVAILABLE',
              error: createError('UNKNOWN', 'startReaderMode rejeitou'),
            })
        );
        return;
      case 'STOP_READER':
        native.stopReaderMode().catch(() => undefined);
        return;
      case 'START_WAIT_TIMER':
        this.clearWaitTimer();
        this.waitTimer = timers.setTimeout(() => {
          this.waitTimer = null;
          this.dispatch({ type: 'WAIT_TIMEOUT' });
        }, this.params.timeoutMs);
        return;
      case 'CLEAR_WAIT_TIMER':
        this.clearWaitTimer();
        return;
      case 'READ_CARD':
        native
          .readCard(
            this.params.amountCents,
            this.params.currencyCode.padStart(4, '0'),
            // Sempre emite as trocas (já mascaradas): a UI usa para o progresso por etapa.
            // O registro de diagnóstico continua condicionado a `diagnostics` (D019).
            true
          )
          .then(
            (outcome) => this.onRead(outcome),
            () =>
              this.dispatch({
                type: 'READ_FAILED',
                error: createError('UNKNOWN', 'readCard rejeitou'),
              })
          );
        return;
      case 'CANCEL_READ':
        native.cancelRead();
        return;
      case 'SCHEDULE': {
        const delay =
          effect.delay === 'immediate' ? 0 : this.deps.display[effect.delay];
        const handle = timers.setTimeout(() => {
          this.scheduled.delete(handle);
          this.dispatch(effect.event);
        }, delay);
        this.scheduled.add(handle);
        return;
      }
      case 'RESOLVE':
        this.finish(effect.outcome);
        return;
    }
  }

  private onRead(outcome: NativeReadOutcome): void {
    if (outcome.ok) {
      if (this.readStartedAt !== null) {
        this.readDurationMs = this.deps.clock.now() - this.readStartedAt;
      }
      this.dispatch({ type: 'READ_SUCCEEDED', card: outcome.card });
    } else {
      this.dispatch({
        type: 'READ_FAILED',
        error: createError(outcome.code, outcome.detail),
      });
    }
  }

  private finish(outcome: Outcome): void {
    if (this.settled) return;
    this.settled = true;
    const result = this.toResult(outcome);
    this.dispose();
    // RN-22: a sessão não guarda o cartão depois de entregar o resultado.
    this.snapshot = initialSnapshot(this.params.maxRetries);
    this.settle?.(result);
  }

  private dispose(): void {
    this.clearWaitTimer();
    this.clearScheduled();
    this.subscriptions.splice(0).forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        reportListenerError(error);
      }
    });
  }

  private toResult(outcome: Outcome): CaptureResult {
    const card = outcome.state === 'SUCCESS' ? outcome.card : undefined;
    const end = this.outcomeAt ?? this.deps.clock.now();
    const meta: CaptureMeta = {
      captureId: this.captureId,
      ...(this.params.reference !== undefined && {
        reference: this.params.reference,
      }),
      startedAt: this.startedAtEpoch,
      durationMs: end - this.startedAtMono,
      attempts: this.snapshot.context.attempts,
      stepTimings: card
        ? EMV_STEPS.map((step) => ({
            step,
            durationMs: card.stepDurationsMs[step],
          }))
        : [],
      ...(card && {
        readDurationMs: this.readDurationMs,
        cryptogramPresent: card.cryptogramPresent,
      }),
    };
    switch (outcome.state) {
      case 'SUCCESS':
        return { status: 'success', card: toCardData(outcome.card), meta };
      case 'CANCELLED':
        return { status: 'cancelled', meta };
      case 'TIMEOUT':
        return { status: 'timeout', error: outcome.error, meta };
      case 'ERROR':
        return { status: 'error', error: outcome.error, meta };
    }
  }

  private clearWaitTimer(): void {
    if (this.waitTimer !== null) {
      this.deps.timers.clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
  }

  private clearScheduled(): void {
    this.scheduled.forEach((handle) => this.deps.timers.clearTimeout(handle));
    this.scheduled.clear();
  }
}

function toCardData(card: NativeCardRead): CardData {
  return {
    pan: card.pan,
    panMasked: card.panMasked,
    expiry: card.expiry,
    brand: card.brand,
    aid: card.aid,
    ...(card.applicationLabel !== undefined && {
      applicationLabel: card.applicationLabel,
    }),
    ...(card.panSequenceNumber !== undefined && {
      panSequenceNumber: card.panSequenceNumber,
    }),
  };
}
