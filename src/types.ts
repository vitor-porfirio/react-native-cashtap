export const NFC_STATUSES = ['UNSUPPORTED', 'DISABLED', 'READY'] as const;

/** Disponibilidade do NFC no aparelho. */
export type NfcStatus = (typeof NFC_STATUSES)[number];

/** Cancela uma assinatura de evento. */
export type Unsubscribe = () => void;
