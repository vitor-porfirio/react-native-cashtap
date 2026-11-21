export const NFC_STATUSES = ['UNSUPPORTED', 'DISABLED', 'READY'] as const;

/** Disponibilidade do NFC no aparelho. */
export type NfcStatus = (typeof NFC_STATUSES)[number];

/** Cancela uma assinatura de evento. */
export type Unsubscribe = () => void;

export const CARD_BRANDS = ['visa', 'mastercard'] as const;

/** Bandeira inferida pelo AID do cartão, nunca pelo PAN (RN-20). */
export type CardBrand = (typeof CARD_BRANDS)[number];

export const EMV_STEPS = [
  'SELECT_PPSE',
  'SELECT_AID',
  'GET_PROCESSING_OPTIONS',
  'READ_RECORD',
] as const;

/** Etapas do diálogo com o cartão, medidas separadamente (E8-H2). */
export type EmvStep = (typeof EMV_STEPS)[number];
