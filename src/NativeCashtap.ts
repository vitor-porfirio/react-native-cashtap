import {
  TurboModuleRegistry,
  type CodegenTypes,
  type TurboModule,
} from 'react-native';

export type TagDetectedEvent = {
  /** Relógio monotônico do nativo, em ms (SystemClock.elapsedRealtime). */
  detectedAt: number;
};

/** Troca de APDU já mascarada na origem (RN-23). */
export type DiagnosticEvent = {
  step: string;
  command: string;
  response: string;
  sw: string;
  durationMs: number;
};

/**
 * Contrato privado TS ↔ Kotlin, lido pelo Codegen.
 * Não importar fora de `src/native.ts`.
 * Operações atômicas e sem memória de fluxo (especificação §2.3).
 */
export interface Spec extends TurboModule {
  getNfcStatus(): Promise<string>;
  openNfcSettings(): void;

  /** Rejeita com NFC_UNSUPPORTED, NFC_DISABLED ou UNKNOWN. */
  startReaderMode(): Promise<void>;
  /** Idempotente (RN-11). */
  stopReaderMode(): Promise<void>;
  /**
   * Executa o diálogo EMV com o cartão detectado. Resolve com JSON do resultado;
   * rejeita com um código do catálogo (CARD_REMOVED, UNSUPPORTED_BRAND, ...).
   */
  readCard(
    amountCents: number,
    currencyCode: string,
    diagnostics: boolean
  ): Promise<string>;
  /** Pede cancelamento; efetivado entre dois comandos APDU (RN-10). */
  cancelRead(): void;

  readonly onNfcStatusChange: CodegenTypes.EventEmitter<string>;
  readonly onTagDetected: CodegenTypes.EventEmitter<TagDetectedEvent>;
  readonly onDiagnostic: CodegenTypes.EventEmitter<DiagnosticEvent>;
}

export default TurboModuleRegistry.get<Spec>('Cashtap');
