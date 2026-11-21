import {
  nativeGetNfcStatus,
  nativeOpenNfcSettings,
  subscribeNfcStatus,
} from './native';
import type { NfcStatus, Unsubscribe } from './types';

/**
 * Consulta a disponibilidade do NFC.
 * Fora do Android sempre resolve `'UNSUPPORTED'`.
 */
export function getNfcStatus(): Promise<NfcStatus> {
  return nativeGetNfcStatus();
}

/** Notifica quando o usuário liga ou desliga o NFC nas configurações. */
export function onNfcStatusChange(
  listener: (status: NfcStatus) => void
): Unsubscribe {
  return subscribeNfcStatus(listener);
}

/** Abre a tela de configurações de NFC do sistema (RN-02). */
export function openNfcSettings(): void {
  nativeOpenNfcSettings();
}
