// Captura
export { capture, cancel, onStateChange } from './core/controller';
export type {
  CaptureParams,
  CaptureResult,
  CardData,
  CaptureMeta,
  StepTiming,
  CaptureState,
  CaptureStateEvent,
  CardBrand,
  EmvStep,
} from './types';
export type { CashTapError, ErrorCode } from './errors';

// NFC
export { getNfcStatus, onNfcStatusChange, openNfcSettings } from './api';
export type { NfcStatus, Unsubscribe } from './types';

// Interface
export {
  CashTapProvider,
  type CashTapProviderProps,
} from './ui/CashTapProvider';
export type { CashTapAppearance, CashTapColors, CashTapTexts } from './types';
