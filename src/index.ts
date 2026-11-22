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
export {
  DARK_COLORS,
  LIGHT_COLORS,
  DEFAULT_TEXTS,
  type CashTapAppearance,
  type CashTapColors,
  type CashTapTexts,
} from './ui/theme';

// Diagnóstico e medição (desenvolvimento e ensaios)
export {
  CashTapDiagnostics,
  type CashTapDiagnosticsProps,
} from './ui/CashTapDiagnostics';
export {
  getLastDiagnostics,
  onDiagnosticsChange,
  diagnosticsToText,
  type DiagnosticsReport,
} from './core/diagnostics';
export {
  toMeasurementRow,
  measurementsToCsv,
  MEASUREMENT_COLUMNS,
  type MeasurementRow,
  type MeasurementOutcome,
} from './core/measurements';
