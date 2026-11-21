import { Platform } from 'react-native';
import NativeCashtap, { type Spec } from './NativeCashtap';
import {
  CARD_BRANDS,
  EMV_STEPS,
  NFC_STATUSES,
  type CardBrand,
  type EmvStep,
  type NfcStatus,
  type Unsubscribe,
} from './types';

export const LINKING_ERROR =
  "react-native-cashtap: o módulo nativo 'Cashtap' não foi encontrado. " +
  'Recompile o app Android (ex.: `yarn android`) depois de instalar o pacote; ' +
  'recarregar só o JavaScript não basta.';

/**
 * Único ponto de acesso ao Turbo Module.
 * - Fora do Android devolve `null`: a API responde `UNSUPPORTED` sem lançar (D008).
 * - No Android, módulo ausente é erro de instalação, não "aparelho sem NFC" (D010).
 */
export function getNativeModule(): Spec | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  if (!NativeCashtap) {
    throw new Error(LINKING_ERROR);
  }
  return NativeCashtap;
}

function includes<T extends string>(
  list: readonly T[],
  value: unknown
): value is T {
  return (
    typeof value === 'string' && (list as readonly string[]).includes(value)
  );
}

export function isNfcStatus(value: unknown): value is NfcStatus {
  return includes(NFC_STATUSES, value);
}

// ---- Status do NFC ----

export async function nativeGetNfcStatus(): Promise<NfcStatus> {
  const module = getNativeModule();
  if (!module) {
    return 'UNSUPPORTED';
  }
  const value = await module.getNfcStatus();
  if (!isNfcStatus(value)) {
    throw new Error(
      `react-native-cashtap: status de NFC inválido recebido do nativo: ${String(value)}`
    );
  }
  return value;
}

export function nativeOpenNfcSettings(): void {
  getNativeModule()?.openNfcSettings();
}

export function subscribeNfcStatus(
  listener: (status: NfcStatus) => void
): Unsubscribe {
  const module = getNativeModule();
  if (!module) {
    return () => {};
  }
  const subscription = module.onNfcStatusChange((value) => {
    if (isNfcStatus(value)) {
      listener(value);
    } else if (__DEV__) {
      console.warn(
        `react-native-cashtap: evento de NFC descartado: ${String(value)}`
      );
    }
  });
  return () => subscription.remove();
}

// ---- Reader mode ----

export const START_ERROR_CODES = [
  'NFC_UNSUPPORTED',
  'NFC_DISABLED',
  'UNKNOWN',
] as const;
export type StartErrorCode = (typeof START_ERROR_CODES)[number];

export type NativeFailure<C extends string> = {
  ok: false;
  code: C;
  detail: string;
};

/** Erros esperados atravessam como valor, nunca como exceção (typescript-api.md). */
function toFailure<C extends string>(
  error: unknown,
  codes: readonly C[],
  fallback: C
): NativeFailure<C> {
  const code = (error as { code?: unknown } | null)?.code;
  const message = (error as { message?: unknown } | null)?.message;
  return {
    ok: false,
    code: includes(codes, code) ? code : fallback,
    detail: typeof message === 'string' ? message : String(error),
  };
}

export async function nativeStartReaderMode(): Promise<
  { ok: true } | NativeFailure<StartErrorCode>
> {
  const module = getNativeModule();
  if (!module) {
    return { ok: false, code: 'NFC_UNSUPPORTED', detail: 'fora do Android' };
  }
  try {
    await module.startReaderMode();
    return { ok: true };
  } catch (error) {
    return toFailure(error, START_ERROR_CODES, 'UNKNOWN');
  }
}

/** RN-11: nunca lança; desligar o rádio é sempre seguro. */
export async function nativeStopReaderMode(): Promise<void> {
  try {
    await getNativeModule()?.stopReaderMode();
  } catch {
    // Sem módulo ou rádio já desligado: nada a fazer.
  }
}

// ---- Leitura do cartão ----

export const READ_ERROR_CODES = [
  'CARD_REMOVED',
  'UNSUPPORTED_BRAND',
  'PROTOCOL_ERROR',
  'PARSE_ERROR',
  'INCOMPLETE_DATA',
  'CANCELLED_BY_USER',
  'UNKNOWN',
] as const;
export type ReadErrorCode = (typeof READ_ERROR_CODES)[number];

/** Resultado bruto do diálogo EMV, já validado. Uso interno do SDK. */
export type NativeCardRead = {
  pan: string;
  panMasked: string;
  expiry: string;
  brand: CardBrand;
  aid: string;
  applicationLabel?: string;
  panSequenceNumber?: string;
  cryptogramPresent: boolean;
  stepDurationsMs: Record<EmvStep, number>;
};

export type NativeReadOutcome =
  { ok: true; card: NativeCardRead } | NativeFailure<ReadErrorCode>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

/** INV-4 começa aqui: nada sem PAN e validade bem formados chega à máquina de estados. */
export function parseCardRead(json: string): NativeCardRead | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;
  const { pan, panMasked, expiry, brand, aid, stepDurationsMs } = data;
  if (
    typeof pan !== 'string' ||
    !/^\d{12,19}$/.test(pan) ||
    typeof panMasked !== 'string' ||
    panMasked.length !== pan.length ||
    !panMasked.includes('*') ||
    typeof expiry !== 'string' ||
    !/^\d{2}(0[1-9]|1[0-2])$/.test(expiry) ||
    !includes(CARD_BRANDS, brand) ||
    typeof aid !== 'string' ||
    !/^[0-9A-F]{10,32}$/.test(aid) ||
    !optionalString(data.applicationLabel) ||
    !optionalString(data.panSequenceNumber) ||
    typeof data.cryptogramPresent !== 'boolean' ||
    !isObject(stepDurationsMs) ||
    !EMV_STEPS.every(
      (step) =>
        typeof stepDurationsMs[step] === 'number' &&
        (stepDurationsMs[step] as number) >= 0
    )
  ) {
    return null;
  }
  return {
    pan,
    panMasked,
    expiry,
    brand,
    aid,
    applicationLabel: data.applicationLabel as string | undefined,
    panSequenceNumber: data.panSequenceNumber as string | undefined,
    cryptogramPresent: data.cryptogramPresent,
    stepDurationsMs: stepDurationsMs as Record<EmvStep, number>,
  };
}

export async function nativeReadCard(
  amountCents: number,
  currencyCode: string,
  diagnostics: boolean
): Promise<NativeReadOutcome> {
  const module = getNativeModule();
  if (!module) {
    return { ok: false, code: 'UNKNOWN', detail: 'fora do Android' };
  }
  let json: string;
  try {
    json = await module.readCard(amountCents, currencyCode, diagnostics);
  } catch (error) {
    return toFailure(error, READ_ERROR_CODES, 'UNKNOWN');
  }
  const card = parseCardRead(json);
  if (!card) {
    // Não repassa o JSON: ele pode conter o PAN (RN-23).
    return {
      ok: false,
      code: 'PARSE_ERROR',
      detail: 'resultado do nativo fora do contrato',
    };
  }
  return { ok: true, card };
}

export function nativeCancelRead(): void {
  getNativeModule()?.cancelRead();
}

// ---- Eventos da sessão ----

export function subscribeTagDetected(listener: () => void): Unsubscribe {
  const module = getNativeModule();
  if (!module) {
    return () => {};
  }
  const subscription = module.onTagDetected(() => listener());
  return () => subscription.remove();
}

/** Troca de APDU mascarada na origem, para o modo de diagnóstico (E7-H3). */
export type DiagnosticExchange = {
  step: EmvStep;
  command: string;
  response: string;
  sw: string;
  durationMs: number;
};

export function subscribeDiagnostic(
  listener: (exchange: DiagnosticExchange) => void
): Unsubscribe {
  const module = getNativeModule();
  if (!module) {
    return () => {};
  }
  const subscription = module.onDiagnostic((event) => {
    if (includes(EMV_STEPS, event.step)) {
      listener({ ...event, step: event.step });
    }
  });
  return () => subscription.remove();
}
