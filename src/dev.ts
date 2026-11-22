/**
 * `react-native-cashtap/dev`: ferramentas de desenvolvimento e de ensaio (E7-H3, E8-H2).
 * Ficam fora do entry principal para não entrarem no bundle de produção de quem não as importa
 * e para que a superfície pública de `react-native-cashtap` continue mínima (D020).
 */
export {
  CashTapDiagnostics,
  type CashTapDiagnosticsProps,
} from './ui/CashTapDiagnostics';
export {
  getLastDiagnostics,
  onDiagnosticsChange,
  diagnosticsToText,
  type DiagnosticsReport,
  type DiagnosticsExchange,
} from './core/diagnostics';
export {
  toMeasurementRow,
  measurementsToCsv,
  MEASUREMENT_COLUMNS,
  type MeasurementRow,
  type MeasurementOutcome,
} from './core/measurements';
