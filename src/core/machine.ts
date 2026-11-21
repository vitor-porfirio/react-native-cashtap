import { createError, isAutoRecoverable, type CashTapError } from '../errors';
import type { NativeCardRead } from '../native';

/** Estados do ciclo de captura (especificação §4.1). */
export const CAPTURE_STATES = [
  'IDLE',
  'CHECKING',
  'WAITING_CARD',
  'READING',
  'RECOVERABLE_FAILURE',
  'PROCESSING',
  'SUCCESS',
  'CANCELLED',
  'TIMEOUT',
  'ERROR',
] as const;

export type CaptureState = (typeof CAPTURE_STATES)[number];

export const TERMINAL_STATES: ReadonlySet<CaptureState> = new Set([
  'SUCCESS',
  'CANCELLED',
  'TIMEOUT',
  'ERROR',
]);

export type MachineContext = {
  maxRetries: number;
  /** Leituras iniciadas (entradas em READING). */
  attempts: number;
  /** Falhas recuperáveis ocorridas (RN-07, RN-08). */
  failures: number;
  /** RN-10: cancelamento pedido durante uma operação atômica. */
  cancelRequested: boolean;
  /** D017: cartão reaproximado durante a leitura; se ela falhar, lê de novo na hora. */
  pendingTag: boolean;
  error?: CashTapError;
  card?: NativeCardRead;
};

export type MachineSnapshot = {
  state: CaptureState;
  context: MachineContext;
};

export type MachineEvent =
  | { type: 'START' }
  | { type: 'NFC_READY' }
  | { type: 'NFC_UNAVAILABLE'; error: CashTapError }
  | { type: 'TAG_DETECTED' }
  | { type: 'WAIT_TIMEOUT' }
  | { type: 'CANCEL' }
  | { type: 'READ_SUCCEEDED'; card: NativeCardRead }
  | { type: 'READ_FAILED'; error: CashTapError }
  | { type: 'RETRY' }
  | { type: 'PROCESS' }
  | { type: 'RECHECK' }
  | { type: 'FINISH' };

/** Quanto tempo o runner espera antes de disparar um evento agendado. */
export type DelayKind = 'immediate' | 'recovery' | 'success' | 'failure';

export type Outcome =
  | { state: 'SUCCESS'; card: NativeCardRead }
  | { state: 'CANCELLED' }
  | { state: 'TIMEOUT'; error: CashTapError }
  | { state: 'ERROR'; error: CashTapError };

/** Efeitos colaterais pedidos pela máquina; quem os executa é o runner. */
export type Effect =
  | { type: 'START_READER' }
  | { type: 'STOP_READER' }
  | { type: 'START_WAIT_TIMER' }
  | { type: 'CLEAR_WAIT_TIMER' }
  | { type: 'READ_CARD' }
  | { type: 'CANCEL_READ' }
  | { type: 'SCHEDULE'; event: MachineEvent; delay: DelayKind }
  | { type: 'RESOLVE'; outcome: Outcome };

export type Transition = {
  snapshot: MachineSnapshot;
  effects: Effect[];
  /** `false` quando o evento não se aplica ao estado atual e foi ignorado. */
  changed: boolean;
};

export function initialSnapshot(maxRetries: number): MachineSnapshot {
  return {
    state: 'IDLE',
    context: {
      maxRetries,
      attempts: 0,
      failures: 0,
      cancelRequested: false,
      pendingTag: false,
    },
  };
}

export function isTerminal(state: CaptureState): boolean {
  return TERMINAL_STATES.has(state);
}

const ignored = (snapshot: MachineSnapshot): Transition => ({
  snapshot,
  effects: [],
  changed: false,
});

function go(
  state: CaptureState,
  context: MachineContext,
  effects: Effect[] = []
): Transition {
  return { snapshot: { state, context }, effects, changed: true };
}

/**
 * Entrada em estado terminal: INV-1 (reader mode desligado) e agendamento do
 * encerramento. NFC_DISABLED espera a ação do operador (RN-02); NFC_UNSUPPORTED
 * encerra sem exibir nada (RN-01).
 */
function enterTerminal(
  state: 'SUCCESS' | 'CANCELLED' | 'TIMEOUT' | 'ERROR',
  context: MachineContext,
  leading: Effect[] = []
): Transition {
  const effects: Effect[] = [...leading, { type: 'STOP_READER' }];
  const code = context.error?.code;
  if (state === 'ERROR' && code === 'NFC_DISABLED') {
    return go(state, context, effects);
  }
  const delay: DelayKind =
    state === 'SUCCESS'
      ? 'success'
      : state === 'CANCELLED' || code === 'NFC_UNSUPPORTED'
        ? 'immediate'
        : 'failure';
  effects.push({ type: 'SCHEDULE', event: { type: 'FINISH' }, delay });
  return go(state, context, effects);
}

function outcomeOf(snapshot: MachineSnapshot): Outcome {
  const { state, context } = snapshot;
  switch (state) {
    case 'SUCCESS':
      return { state, card: context.card as NativeCardRead };
    case 'CANCELLED':
      return { state };
    case 'TIMEOUT':
      return { state, error: context.error ?? createError('TIMEOUT') };
    default:
      return { state: 'ERROR', error: context.error ?? createError('UNKNOWN') };
  }
}

/** INV-4: SUCCESS só com PAN e validade presentes. */
function hasRequiredData(
  card: NativeCardRead | undefined
): card is NativeCardRead {
  return Boolean(card?.pan) && Boolean(card?.expiry);
}

/** Pode ler de novo depois de `failures` falhas recuperáveis? (RN-08) */
function canRetry(context: MachineContext): boolean {
  return context.failures <= context.maxRetries;
}

/**
 * Função de transição pura (especificação §4.2). Não executa nada:
 * devolve o próximo estado e os efeitos que o runner deve aplicar.
 */
export function transition(
  snapshot: MachineSnapshot,
  event: MachineEvent
): Transition {
  const { state, context } = snapshot;

  const finishing =
    event.type === 'FINISH' ||
    // Operador desiste na tela de NFC desligado: encerra com o próprio NFC_DISABLED.
    (event.type === 'CANCEL' &&
      state === 'ERROR' &&
      context.error?.code === 'NFC_DISABLED');
  if (finishing) {
    if (!isTerminal(state)) return ignored(snapshot);
    return go(
      'IDLE',
      {
        maxRetries: context.maxRetries,
        attempts: context.attempts,
        failures: context.failures,
        cancelRequested: false,
        pendingTag: false,
      },
      [{ type: 'RESOLVE', outcome: outcomeOf(snapshot) }]
    );
  }

  switch (state) {
    case 'IDLE':
      if (event.type === 'START') {
        return go('CHECKING', context, [{ type: 'START_READER' }]);
      }
      return ignored(snapshot);

    case 'CHECKING':
      switch (event.type) {
        case 'NFC_READY':
          if (context.cancelRequested) {
            return enterTerminal('CANCELLED', context);
          }
          return go('WAITING_CARD', context, [{ type: 'START_WAIT_TIMER' }]);
        case 'NFC_UNAVAILABLE':
          return enterTerminal('ERROR', { ...context, error: event.error });
        case 'CANCEL':
          // A verificação está em curso: o cancelamento vale quando ela terminar.
          return go('CHECKING', { ...context, cancelRequested: true });
        default:
          return ignored(snapshot);
      }

    case 'WAITING_CARD':
      switch (event.type) {
        case 'TAG_DETECTED':
          return go(
            'READING',
            {
              ...context,
              attempts: context.attempts + 1,
              error: undefined,
              pendingTag: false,
            },
            [{ type: 'CLEAR_WAIT_TIMER' }, { type: 'READ_CARD' }]
          );
        case 'WAIT_TIMEOUT':
          return enterTerminal(
            'TIMEOUT',
            { ...context, error: createError('TIMEOUT') },
            [{ type: 'CLEAR_WAIT_TIMER' }]
          );
        case 'CANCEL':
          return enterTerminal('CANCELLED', context, [
            { type: 'CLEAR_WAIT_TIMER' },
          ]);
        default:
          return ignored(snapshot);
      }

    case 'READING':
      switch (event.type) {
        case 'TAG_DETECTED':
          // D017: o nativo guardou a tag mais recente; não lê agora (a leitura
          // atual ainda está em curso), só lembra para o caso de ela falhar.
          if (context.pendingTag) return ignored(snapshot);
          return go('READING', { ...context, pendingTag: true });
        case 'CANCEL':
          if (context.cancelRequested) return ignored(snapshot);
          // RN-10: aceito agora, efetivado ao fim da operação atômica.
          return go('READING', { ...context, cancelRequested: true }, [
            { type: 'CANCEL_READ' },
          ]);
        case 'READ_SUCCEEDED':
          if (context.cancelRequested) {
            return enterTerminal('CANCELLED', context);
          }
          return go('PROCESSING', { ...context, card: event.card }, [
            {
              type: 'SCHEDULE',
              event: { type: 'PROCESS' },
              delay: 'immediate',
            },
          ]);
        case 'READ_FAILED': {
          if (
            context.cancelRequested ||
            event.error.code === 'CANCELLED_BY_USER'
          ) {
            return enterTerminal('CANCELLED', context);
          }
          if (isAutoRecoverable(event.error.code)) {
            const next = {
              ...context,
              failures: context.failures + 1,
              error: event.error,
            };
            // Cartão já reaproximado durante a leitura: tenta de novo sem esperar.
            const effect: Effect =
              context.pendingTag && canRetry(next)
                ? {
                    type: 'SCHEDULE',
                    event: { type: 'TAG_DETECTED' },
                    delay: 'immediate',
                  }
                : {
                    type: 'SCHEDULE',
                    event: { type: 'RETRY' },
                    delay: 'recovery',
                  };
            return go('RECOVERABLE_FAILURE', next, [effect]);
          }
          return enterTerminal('ERROR', { ...context, error: event.error });
        }
        default:
          return ignored(snapshot);
      }

    case 'RECOVERABLE_FAILURE':
      switch (event.type) {
        case 'RETRY':
          if (canRetry(context)) {
            // RN-09: cada retentativa reinicia o tempo de espera.
            return go('WAITING_CARD', context, [{ type: 'START_WAIT_TIMER' }]);
          }
          return enterTerminal('ERROR', {
            ...context,
            error: createError(
              'READ_FAILED_MAX_RETRIES',
              `${context.failures} falha(s); última: ${context.error?.code ?? 'desconhecida'}`
            ),
          });
        case 'TAG_DETECTED':
          // Cartão reaproximado antes do fim da mensagem de falha: lê direto.
          if (!canRetry(context)) return ignored(snapshot);
          return go(
            'READING',
            {
              ...context,
              attempts: context.attempts + 1,
              error: undefined,
              pendingTag: false,
            },
            [{ type: 'READ_CARD' }]
          );
        case 'CANCEL':
          return enterTerminal('CANCELLED', context);
        default:
          return ignored(snapshot);
      }

    case 'PROCESSING':
      if (event.type !== 'PROCESS') return ignored(snapshot);
      if (hasRequiredData(context.card)) {
        return enterTerminal('SUCCESS', context);
      }
      return enterTerminal('ERROR', {
        ...context,
        card: undefined,
        error: createError('INCOMPLETE_DATA', 'PAN ou validade ausente'),
      });

    case 'ERROR':
      // RN-02: com o NFC desligado, o operador pode ligar e reverificar.
      if (event.type === 'RECHECK' && context.error?.code === 'NFC_DISABLED') {
        return go('CHECKING', { ...context, error: undefined }, [
          { type: 'START_READER' },
        ]);
      }
      return ignored(snapshot);

    default:
      return ignored(snapshot);
  }
}
