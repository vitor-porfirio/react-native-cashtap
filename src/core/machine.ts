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

/** Contexto comum a todos os estados. */
export type MachineContext = {
  maxRetries: number;
  /** Leituras iniciadas (entradas em READING). */
  attempts: number;
  /** Falhas recuperáveis ocorridas (RN-07, RN-08). */
  failures: number;
  /** RN-10: cancelamento pedido durante uma operação em curso. */
  cancelRequested: boolean;
  /** D017: cartão detectado quando ainda não dava para ler; lê assim que possível. */
  pendingTag: boolean;
};

/**
 * Snapshot discriminado pelo estado: dado só existe onde faz sentido.
 * SUCCESS sem cartão, ERROR sem erro ou IDLE com cartão não compilam (#19).
 */
export type MachineSnapshot =
  | {
      state: 'IDLE' | 'CHECKING' | 'WAITING_CARD' | 'READING' | 'CANCELLED';
      context: MachineContext;
    }
  | {
      state: 'RECOVERABLE_FAILURE' | 'TIMEOUT' | 'ERROR';
      context: MachineContext;
      error: CashTapError;
    }
  | {
      state: 'PROCESSING' | 'SUCCESS';
      context: MachineContext;
      card: NativeCardRead;
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
  | { state: 'TIMEOUT' | 'ERROR'; error: CashTapError };

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

const moved = (
  snapshot: MachineSnapshot,
  effects: Effect[] = []
): Transition => ({
  snapshot,
  effects,
  changed: true,
});

/** Contexto ao reiniciar a verificação ou voltar a IDLE: flags de operação limpas. */
function cleared(context: MachineContext): MachineContext {
  return { ...context, cancelRequested: false, pendingTag: false };
}

type TerminalEntry =
  | { state: 'SUCCESS'; card: NativeCardRead }
  | { state: 'CANCELLED' }
  | { state: 'TIMEOUT' | 'ERROR'; error: CashTapError };

/**
 * Entrada em estado terminal: INV-1 (reader mode desligado) e agendamento do
 * encerramento. NFC_DISABLED espera a ação do operador (RN-02); NFC_UNSUPPORTED
 * encerra sem exibir nada (RN-01); cancelamento encerra na hora.
 */
function enterTerminal(
  entry: TerminalEntry,
  context: MachineContext,
  leading: Effect[] = []
): Transition {
  const effects: Effect[] = [...leading, { type: 'STOP_READER' }];
  const code = 'error' in entry ? entry.error.code : undefined;
  const snapshot: MachineSnapshot = { ...entry, context: cleared(context) };
  if (entry.state === 'ERROR' && code === 'NFC_DISABLED') {
    return moved(snapshot, effects);
  }
  const delay: DelayKind =
    entry.state === 'SUCCESS'
      ? 'success'
      : entry.state === 'CANCELLED' || code === 'NFC_UNSUPPORTED'
        ? 'immediate'
        : 'failure';
  effects.push({ type: 'SCHEDULE', event: { type: 'FINISH' }, delay });
  return moved(snapshot, effects);
}

function outcomeOf(snapshot: MachineSnapshot): Outcome | null {
  switch (snapshot.state) {
    case 'SUCCESS':
      return { state: 'SUCCESS', card: snapshot.card };
    case 'CANCELLED':
      return { state: 'CANCELLED' };
    case 'TIMEOUT':
    case 'ERROR':
      return { state: snapshot.state, error: snapshot.error };
    default:
      return null;
  }
}

/** INV-4: SUCCESS só com PAN e validade presentes. */
function hasRequiredData(card: NativeCardRead): boolean {
  return card.pan.length > 0 && card.expiry.length > 0;
}

/** Pode ler de novo depois de `failures` falhas recuperáveis? (RN-08) */
function canRetry(context: MachineContext): boolean {
  return context.failures <= context.maxRetries;
}

function startReading(
  context: MachineContext,
  leading: Effect[] = []
): Transition {
  return moved(
    {
      state: 'READING',
      context: {
        ...context,
        attempts: context.attempts + 1,
        pendingTag: false,
      },
    },
    [...leading, { type: 'READ_CARD' }]
  );
}

function finish(snapshot: MachineSnapshot): Transition {
  const outcome = outcomeOf(snapshot);
  if (!outcome) return ignored(snapshot);
  return moved({ state: 'IDLE', context: cleared(snapshot.context) }, [
    { type: 'RESOLVE', outcome },
  ]);
}

/**
 * Função de transição pura (especificação §4.2 + extensões da D018). Não executa
 * nada: devolve o próximo estado e os efeitos que o runner deve aplicar.
 */
export function transition(
  snapshot: MachineSnapshot,
  event: MachineEvent
): Transition {
  const { context } = snapshot;

  if (event.type === 'FINISH') return finish(snapshot);

  switch (snapshot.state) {
    case 'IDLE':
      if (event.type !== 'START') return ignored(snapshot);
      return moved({ state: 'CHECKING', context }, [{ type: 'START_READER' }]);

    case 'CHECKING':
      switch (event.type) {
        case 'NFC_READY':
          if (context.cancelRequested) {
            return enterTerminal({ state: 'CANCELLED' }, context);
          }
          // Cartão já no campo quando o rádio ligou: lê direto, sem timer.
          if (context.pendingTag) return startReading(context);
          return moved({ state: 'WAITING_CARD', context }, [
            { type: 'START_WAIT_TIMER' },
          ]);
        case 'NFC_UNAVAILABLE':
          // O operador já desistiu: não faz sentido pedir que ligue o NFC.
          if (context.cancelRequested) {
            return enterTerminal({ state: 'CANCELLED' }, context);
          }
          return enterTerminal({ state: 'ERROR', error: event.error }, context);
        case 'CANCEL':
          // A verificação está em curso: o cancelamento vale quando ela terminar.
          if (context.cancelRequested) return ignored(snapshot);
          return moved({
            state: 'CHECKING',
            context: { ...context, cancelRequested: true },
          });
        case 'TAG_DETECTED':
          if (context.pendingTag) return ignored(snapshot);
          return moved({
            state: 'CHECKING',
            context: { ...context, pendingTag: true },
          });
        default:
          return ignored(snapshot);
      }

    case 'WAITING_CARD':
      switch (event.type) {
        case 'TAG_DETECTED':
          return startReading(context, [{ type: 'CLEAR_WAIT_TIMER' }]);
        case 'WAIT_TIMEOUT':
          return enterTerminal(
            { state: 'TIMEOUT', error: createError('TIMEOUT') },
            context,
            [{ type: 'CLEAR_WAIT_TIMER' }]
          );
        case 'CANCEL':
          return enterTerminal({ state: 'CANCELLED' }, context, [
            { type: 'CLEAR_WAIT_TIMER' },
          ]);
        case 'NFC_UNAVAILABLE':
          // NFC desligado pelo operador com a tela aberta: não esperar o timeout.
          return enterTerminal(
            { state: 'ERROR', error: event.error },
            context,
            [{ type: 'CLEAR_WAIT_TIMER' }]
          );
        default:
          return ignored(snapshot);
      }

    case 'READING':
      switch (event.type) {
        case 'TAG_DETECTED':
          // D017: a leitura atual segue; só lembra para o caso de ela falhar.
          if (context.pendingTag) return ignored(snapshot);
          return moved({
            state: 'READING',
            context: { ...context, pendingTag: true },
          });
        case 'CANCEL':
          if (context.cancelRequested) return ignored(snapshot);
          // RN-10: aceito agora, efetivado ao fim da operação atômica.
          return moved(
            {
              state: 'READING',
              context: { ...context, cancelRequested: true },
            },
            [{ type: 'CANCEL_READ' }]
          );
        case 'READ_SUCCEEDED':
          if (context.cancelRequested) {
            return enterTerminal({ state: 'CANCELLED' }, context);
          }
          return moved({ state: 'PROCESSING', context, card: event.card }, [
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
            return enterTerminal({ state: 'CANCELLED' }, context);
          }
          if (!isAutoRecoverable(event.error.code)) {
            return enterTerminal(
              { state: 'ERROR', error: event.error },
              context
            );
          }
          const next = { ...context, failures: context.failures + 1 };
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
          return moved(
            { state: 'RECOVERABLE_FAILURE', context: next, error: event.error },
            [effect]
          );
        }
        default:
          return ignored(snapshot);
      }

    case 'RECOVERABLE_FAILURE':
      switch (event.type) {
        case 'RETRY':
          if (canRetry(context)) {
            // RN-09: cada retentativa reinicia o tempo de espera.
            return moved({ state: 'WAITING_CARD', context }, [
              { type: 'START_WAIT_TIMER' },
            ]);
          }
          return enterTerminal(
            {
              state: 'ERROR',
              error: createError(
                'READ_FAILED_MAX_RETRIES',
                `${context.failures} falha(s); última: ${snapshot.error.code}`
              ),
            },
            context
          );
        case 'TAG_DETECTED':
          // Cartão reaproximado antes do fim da mensagem de falha: lê direto.
          if (!canRetry(context)) return ignored(snapshot);
          return startReading(context);
        case 'CANCEL':
          return enterTerminal({ state: 'CANCELLED' }, context);
        case 'NFC_UNAVAILABLE':
          return enterTerminal({ state: 'ERROR', error: event.error }, context);
        default:
          return ignored(snapshot);
      }

    case 'PROCESSING':
      // CANCEL é ignorado: a leitura já terminou e o resultado é entregue (D018).
      if (event.type !== 'PROCESS') return ignored(snapshot);
      if (hasRequiredData(snapshot.card)) {
        return enterTerminal(
          { state: 'SUCCESS', card: snapshot.card },
          context
        );
      }
      return enterTerminal(
        {
          state: 'ERROR',
          error: createError('INCOMPLETE_DATA', 'PAN ou validade ausente'),
        },
        context
      );

    case 'ERROR':
      if (snapshot.error.code !== 'NFC_DISABLED') return ignored(snapshot);
      // RN-02: com o NFC desligado, o operador pode ligar e reverificar...
      if (event.type === 'RECHECK') {
        return moved({ state: 'CHECKING', context: cleared(context) }, [
          { type: 'START_READER' },
        ]);
      }
      // ...ou desistir: encerra com o próprio NFC_DISABLED.
      if (event.type === 'CANCEL') return finish(snapshot);
      return ignored(snapshot);

    default:
      // SUCCESS, CANCELLED e TIMEOUT só aceitam FINISH.
      return ignored(snapshot);
  }
}
