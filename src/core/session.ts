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
  timestamp: number;
};

/**
 * Casca imperativa da máquina de estados: executa os efeitos pedidos por
 * `transition()` e garante que a Promise de `capture()` resolve uma vez (INV-3).
 */
export class CaptureSession {
  private snapshot: MachineSnapshot;
  private waitTimer: unknown = null;
  private readonly scheduled = new Set<unknown>();
  private readonly subscriptions: Unsubscribe[] = [];
  private settle: ((result: CaptureResult) => void) | null = null;
  private settled = false;
  private startedAtMono = 0;
  private startedAtEpoch = 0;
  private tagDetectedAt: number | null = null;
  private readDurationMs: number | undefined;

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

  start(): Promise<CaptureResult> {
    const promise = new Promise<CaptureResult>((resolve) => {
      this.settle = resolve;
    });
    this.startedAtMono = this.deps.clock.now();
    this.startedAtEpoch = this.deps.clock.epochMs();
    this.subscriptions.push(
      this.deps.native.onTagDetected(() => {
        this.tagDetectedAt = this.deps.clock.now();
        this.dispatch({ type: 'TAG_DETECTED' });
      }),
      this.deps.native.onNfcStatusChange((status) => {
        // RN-02: operador ligou o NFC com a tela de "NFC desligado" aberta.
        if (status === 'READY') this.dispatch({ type: 'RECHECK' });
      })
    );
    this.dispatch({ type: 'START' });
    return promise;
  }

  dispatch(event: MachineEvent): void {
    if (this.settled) return;
    const previous = this.snapshot.state;
    const { snapshot, effects, changed } = transition(this.snapshot, event);
    if (!changed) return;
    this.snapshot = snapshot;
    if (snapshot.state !== previous) {
      // Eventos agendados para o estado anterior não valem mais.
      this.clearScheduled();
      this.onChange({ previous, snapshot, timestamp: this.deps.clock.now() });
    }
    effects.forEach((effect) => this.run(effect));
  }

  private run(effect: Effect): void {
    const { native, timers } = this.deps;
    switch (effect.type) {
      case 'START_READER':
        native.startReaderMode().then((result) => {
          this.dispatch(
            result.ok
              ? { type: 'NFC_READY' }
              : {
                  type: 'NFC_UNAVAILABLE',
                  error: createError(result.code, result.detail),
                }
          );
        });
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
            this.params.diagnostics
          )
          .then((outcome) => {
            if (outcome.ok) {
              if (this.tagDetectedAt !== null) {
                this.readDurationMs =
                  this.deps.clock.now() - this.tagDetectedAt;
              }
              this.dispatch({ type: 'READ_SUCCEEDED', card: outcome.card });
            } else {
              this.dispatch({
                type: 'READ_FAILED',
                error: createError(outcome.code, outcome.detail),
              });
            }
          });
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

  private finish(outcome: Outcome): void {
    if (this.settled) return;
    this.settled = true;
    this.clearWaitTimer();
    this.clearScheduled();
    this.subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    const result = this.toResult(outcome);
    // RN-22: a sessão não guarda o cartão depois de entregar o resultado.
    this.snapshot = initialSnapshot(this.params.maxRetries);
    this.settle?.(result);
  }

  private toResult(outcome: Outcome): CaptureResult {
    const card = outcome.state === 'SUCCESS' ? outcome.card : undefined;
    const meta: CaptureMeta = {
      captureId: this.captureId,
      ...(this.params.reference !== undefined && {
        reference: this.params.reference,
      }),
      startedAt: this.startedAtEpoch,
      durationMs: this.deps.clock.now() - this.startedAtMono,
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
