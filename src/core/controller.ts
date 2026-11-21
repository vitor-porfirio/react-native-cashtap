import { createError, type CashTapError } from '../errors';
import {
  nativeCancelRead,
  nativeReadCard,
  nativeStartReaderMode,
  nativeStopReaderMode,
  subscribeDiagnostic,
  subscribeNfcStatus,
  subscribeTagDetected,
} from '../native';
import { diagnosticsRecorder } from './diagnostics';
import type {
  CaptureParams,
  CaptureResult,
  CaptureStateEvent,
  Unsubscribe,
} from '../types';
import type { MachineEvent, MachineSnapshot } from './machine';
import { resolveParams, type ResolvedParams } from './params';
import {
  CaptureSession,
  DEFAULT_DISPLAY_DURATIONS,
  type SessionChange,
  type SessionDeps,
} from './session';

/** Visão da sessão ativa para a UI do SDK. */
export type ActiveSession = {
  captureId: string;
  params: Readonly<ResolvedParams>;
  snapshot: MachineSnapshot;
};

const monotonicNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

function defaultDeps(): SessionDeps {
  return {
    native: {
      startReaderMode: nativeStartReaderMode,
      stopReaderMode: nativeStopReaderMode,
      readCard: nativeReadCard,
      cancelRead: nativeCancelRead,
      onTagDetected: subscribeTagDetected,
      onNfcStatusChange: subscribeNfcStatus,
      onDiagnostic: subscribeDiagnostic,
    },
    clock: { now: monotonicNow, epochMs: () => Date.now() },
    timers: {
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (handle) =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    display: DEFAULT_DISPLAY_DURATIONS,
  };
}

let deps: SessionDeps = defaultDeps();
let active: CaptureSession | null = null;
let uiHosts = 0;
let requireUiHost = true;
let sequence = 0;
const stateListeners = new Set<(event: CaptureStateEvent) => void>();
const sessionListeners = new Set<(session: ActiveSession | null) => void>();

function nextCaptureId(): string {
  sequence += 1;
  const random = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0');
  return `ct_${Date.now().toString(36)}_${sequence}_${random}`;
}

function immediateFailure(
  captureId: string,
  error: CashTapError,
  reference?: string
): CaptureResult {
  return {
    status: 'error',
    error,
    meta: {
      captureId,
      ...(reference !== undefined && { reference }),
      startedAt: deps.clock.epochMs(),
      durationMs: 0,
      attempts: 0,
      stepTimings: [],
    },
  };
}

function notify(session: CaptureSession, change: SessionChange): void {
  if (session.settings.diagnostics) {
    diagnosticsRecorder.transition(change.snapshot.state, change.timestamp);
  }
  const event: CaptureStateEvent = {
    state: change.snapshot.state,
    previous: change.previous,
    captureId: session.captureId,
    attempts: change.snapshot.context.attempts,
    ...(change.snapshot.context.error && {
      error: change.snapshot.context.error,
    }),
    timestamp: change.timestamp,
  };
  stateListeners.forEach((listener) => listener(event));
  const view = getActiveSession();
  sessionListeners.forEach((listener) => listener(view));
}

/**
 * Inicia uma captura (E5-H1). Resolve sempre com um desfecho; nunca rejeita
 * por erro esperado. Parâmetro inválido (RN-03) e captura concorrente (RN-04)
 * resolvem na hora, sem acionar o rádio.
 */
export async function capture(params: CaptureParams): Promise<CaptureResult> {
  if (requireUiHost && uiHosts === 0) {
    // Erro de integração, não de operação: por isso rejeita em vez de resolver.
    throw new Error(
      'react-native-cashtap: monte <CashTapProvider> na raiz do app antes de chamar capture().'
    );
  }
  const captureId = nextCaptureId();
  const reference = params?.reference;
  if (active) {
    return immediateFailure(
      captureId,
      createError('ALREADY_RUNNING', `captura ativa: ${active.captureId}`),
      reference
    );
  }
  const resolved = resolveParams(params ?? ({} as CaptureParams));
  if (!resolved.ok) {
    return immediateFailure(captureId, resolved.error, reference);
  }

  const session = new CaptureSession(
    captureId,
    resolved.params,
    deps,
    (change) => notify(session, change)
  );
  active = session;
  let stopDiagnostics: Unsubscribe = () => {};
  if (resolved.params.diagnostics) {
    diagnosticsRecorder.start(
      captureId,
      deps.clock.epochMs(),
      deps.clock.now()
    );
    stopDiagnostics = deps.native.onDiagnostic((exchange) =>
      diagnosticsRecorder.exchange(exchange, deps.clock.now())
    );
  }
  try {
    const result = await session.start();
    if (resolved.params.diagnostics) diagnosticsRecorder.finish(result);
    return result;
  } finally {
    stopDiagnostics();
    active = null;
    sessionListeners.forEach((listener) => listener(null));
  }
}

/** Cancela a captura ativa (RN-10). Sem captura ativa, não faz nada. */
export function cancel(): void {
  active?.dispatch({ type: 'CANCEL' });
}

export function onStateChange(
  listener: (event: CaptureStateEvent) => void
): Unsubscribe {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

// ---- Uso interno da UI do SDK ----

/** Chamado pelo `CashTapProvider` ao montar; devolve a função de desmontagem. */
export function registerUiHost(): Unsubscribe {
  uiHosts += 1;
  return () => {
    uiHosts = Math.max(0, uiHosts - 1);
  };
}

export function getActiveSession(): ActiveSession | null {
  if (!active) return null;
  return {
    captureId: active.captureId,
    params: active.settings,
    snapshot: active.current,
  };
}

export function subscribeActiveSession(
  listener: (session: ActiveSession | null) => void
): Unsubscribe {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/** Ações do operador vindas da UI: reverificar NFC (RN-02) ou fechar a tela final. */
export function dispatchFromUi(
  event: Extract<MachineEvent, { type: 'RECHECK' | 'FINISH' }>
): void {
  active?.dispatch(event);
}

// ---- Testes ----

export function __setDepsForTests(
  overrides: Partial<SessionDeps>,
  options: { requireUiHost?: boolean } = {}
): void {
  deps = { ...defaultDeps(), ...overrides };
  requireUiHost = options.requireUiHost ?? false;
}

export function __resetForTests(): void {
  deps = defaultDeps();
  active = null;
  uiHosts = 0;
  requireUiHost = true;
  stateListeners.clear();
  sessionListeners.clear();
  diagnosticsRecorder.reset();
}
