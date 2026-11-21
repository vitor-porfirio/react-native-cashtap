import { Platform } from 'react-native';
import NativeCashtap, { type Spec } from './NativeCashtap';
import { NFC_STATUSES, type NfcStatus, type Unsubscribe } from './types';

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

export function isNfcStatus(value: unknown): value is NfcStatus {
  return (
    typeof value === 'string' &&
    (NFC_STATUSES as readonly string[]).includes(value)
  );
}

function toNfcStatus(value: unknown): NfcStatus {
  if (!isNfcStatus(value)) {
    throw new Error(
      `react-native-cashtap: status de NFC inválido recebido do nativo: ${String(value)}`
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
    } else if (__DEV__) {
      console.warn(
        `react-native-cashtap: evento de NFC descartado: ${String(value)}`
      );
    }
  });
  return () => subscription.remove();
}
