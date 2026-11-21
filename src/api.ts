import {
  nativeGetNfcStatus,
  nativeOpenNfcSettings,
  subscribeNfcStatus,
} from './native';
import type { NfcStatus, Unsubscribe } from './types';

/**
 * Consulta a disponibilidade do NFC (RN-01).
 * Fora do Android sempre resolve `'UNSUPPORTED'`.
 * Rejeita apenas por falha de instalação (módulo nativo não linkado) ou
 * resposta fora do contrato vinda do nativo.
 */
export function getNfcStatus(): Promise<NfcStatus> {
  return nativeGetNfcStatus();
}

/**
 * Notifica quando o usuário liga ou desliga o NFC nas configurações (RN-02).
 * Emite só quando o status muda. Devolve a função que cancela a assinatura.
 */
export function onNfcStatusChange(
  listener: (status: NfcStatus) => void
): Unsubscribe {
  return subscribeNfcStatus(listener);
}

/** Abre a tela de configurações de NFC do sistema (RN-02). */
export function openNfcSettings(): void {
  nativeOpenNfcSettings();
}
