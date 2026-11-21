import { Platform } from 'react-native';
import NativeCashtap, { type Spec } from './NativeCashtap';
import { NFC_STATUSES, type NfcStatus, type Unsubscribe } from './types';

/**
 * Único ponto de acesso ao Turbo Module. Fora do Android, ou se o módulo
 * não foi linkado, devolve `null` em vez de lançar no import.
 */
export function getNativeModule(): Spec | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  return NativeCashtap ?? null;
}

export function isNfcStatus(value: unknown): value is NfcStatus {
  return (
    typeof value === 'string' &&
    (NFC_STATUSES as readonly string[]).includes(value)
  );
}

function toNfcStatus(value: unknown): NfcStatus {
  if (!isNfcStatus(value)) {
    throw new Error(
      `CashTap: status de NFC inválido recebido do nativo: ${String(value)}`
    );
  }
  return value;
}

export async function nativeGetNfcStatus(): Promise<NfcStatus> {
  const module = getNativeModule();
  if (!module) {
    return 'UNSUPPORTED';
  }
  return toNfcStatus(await module.getNfcStatus());
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
    }
  });
  return () => subscription.remove();
}
