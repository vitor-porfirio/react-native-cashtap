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
 *
 * Contrato de sessão (D017):
 * - O reader mode fica ligado de `startReaderMode` a `stopReaderMode`, inclusive
 *   durante `readCard`. NÃO chamar `stopReaderMode` durante uma leitura: derruba o
 *   canal e gera um `CARD_REMOVED` falso. Para interromper, use `cancelRead`.
 * - `onTagDetected` pode chegar a qualquer momento, inclusive durante uma leitura
 *   (cartão que sai e volta). O nativo guarda sempre a tag mais recente e
 *   `readCard` usa essa tag uma única vez. Quem orquestra deve lembrar de uma
 *   detecção ocorrida durante a leitura e ler de novo se a leitura falhar.
 * - A unidade atômica é cada APDU: `cancelRead` é verificado antes de cada comando.
 *   A leitura pode portanto resolver com sucesso depois de `cancelRead`; quem
 *   orquestra deve tratar esse sucesso como cancelamento (RN-10).
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
   * `amountCents`: inteiro em centavos. `currencyCode`: ISO 4217 numérico com
   * 4 dígitos (ex.: "0986"); outro formato rejeita com UNKNOWN sem tocar no rádio.
   * Leitura concorrente rejeita com UNKNOWN e detail `READ_IN_PROGRESS`.
   * `onDiagnostic` é emitido a cada comando em qualquer caso (progresso por etapa);
   * com `diagnostics` falso, `command` e `response` chegam vazios.
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
