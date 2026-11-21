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
import type {
  CaptureParams,
  CaptureResult,
  CaptureStateEvent,
  CardBrand,
  Unsubscribe,
} from '../types';
import { diagnosticsRecorder } from './diagnostics';
import type { CaptureState, MachineEvent, MachineSnapshot } from './machine';
import { resolveParams, type ResolvedParams } from './params';
import {
  CaptureSession,
  DEFAULT_DISPLAY_DURATIONS,
  type SessionChange,
  type SessionDeps,
} from './session';

/**
 * Projeção da sessão ativa para a UI do SDK. Nunca carrega o PAN completo:
 * ele só existe no resultado de `capture()` (RN-24).
 */
export type ActiveSession = {
  captureId: string;
  state: CaptureState;
  params: Pick<ResolvedParams, 'amountCents' | 'currencyCode' | 'maxRetries'> &
    Partial<Pick<ResolvedParams, 'appearance'>>;
  attempts: number;
  failures: number;
  cancelRequested: boolean;
  error?: CashTapError;
  card?: {
    panMasked: string;
    brand: CardBrand;
    expiry: string;
    applicationLabel?: string;
  };
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
/** Última projeção publicada: estável entre mudanças (useSyncExternalStore). */
let activeView: ActiveSession | null = null;
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

function errorOf(snapshot: MachineSnapshot): CashTapError | undefined {
  return 'error' in snapshot ? snapshot.error : undefined;
}

function project(session: CaptureSession): ActiveSession {
  const snapshot = session.current;
  const { amountCents, currencyCode, maxRetries, appearance } =
    session.settings;
  const error = errorOf(snapshot);
  const card = 'card' in snapshot ? snapshot.card : undefined;
  return {
    captureId: session.captureId,
    state: snapshot.state,
    params: {
      amountCents,
      currencyCode,
      maxRetries,
      ...(appearance !== undefined && { appearance }),
    },
    attempts: snapshot.context.attempts,
    failures: snapshot.context.failures,
    cancelRequested: snapshot.context.cancelRequested,
    ...(error && { error }),
    ...(card && {
      card: {
        panMasked: card.panMasked,
        brand: card.brand,
        expiry: card.expiry,
        ...(card.applicationLabel !== undefined && {
          applicationLabel: card.applicationLabel,
        }),
      },
    }),
  };
}

function safely(listener: () => void): void {
  try {
    listener();
  } catch (error) {
    if (__DEV__)
      console.error('react-native-cashtap: um listener lançou exceção', error);
  }
}

function publish(view: ActiveSession | null): void {
  activeView = view;
  sessionListeners.forEach((listener) => safely(() => listener(view)));
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
  const error = errorOf(change.snapshot);
  const event: CaptureStateEvent = {
    state: change.snapshot.state,
    previous: change.previous,
    captureId: session.captureId,
    attempts: change.snapshot.context.attempts,
    ...(error && { error }),
    timestamp: change.timestamp,
  };
  stateListeners.forEach((listener) => safely(() => listener(event)));
  if (active === session) publish(project(session));
}

/**
 * Inicia uma captura (E5-H1). Resolve sempre com um desfecho; nunca rejeita
 * por erro esperado. Parâmetro inválido (RN-03) e captura concorrente (RN-04)
 * resolvem na hora, sem acionar o rádio. Rejeita só por erro de integração
 * (Provider ausente, módulo nativo não instalado).
 */
export async function capture(params: CaptureParams): Promise<CaptureResult> {
  if (requireUiHost && uiHosts === 0) {
    throw new Error(
      'react-native-cashtap: monte <CashTapProvider> na raiz do app antes de chamar capture().'
    );
  }
  const captureId = nextCaptureId();
  const reference =
    typeof params?.reference === 'string' ? params.reference : undefined;
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
  let stopDiagnostics: Unsubscribe = () => {};
  active = session;
  try {
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
    publish(project(session));
    const result = await session.start();
    if (resolved.params.diagnostics) diagnosticsRecorder.finish(result);
    return result;
  } finally {
    safely(stopDiagnostics);
    active = null;
    publish(null);
  }
}

/**
 * Cancela a captura ativa (RN-10). Imediato em WAITING_CARD e RECOVERABLE_FAILURE;
 * diferido em CHECKING e READING; ignorado em PROCESSING e nos estados finais,
 * quando o resultado já existe (D018). Sem captura ativa, não faz nada.
 */
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
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    uiHosts = Math.max(0, uiHosts - 1);
  };
}

export function getActiveSession(): ActiveSession | null {
  return activeView;
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
  activeView = null;
  uiHosts = 0;
  requireUiHost = true;
  stateListeners.clear();
  sessionListeners.clear();
  diagnosticsRecorder.reset();
}
