import {
  TurboModuleRegistry,
  type CodegenTypes,
  type TurboModule,
} from 'react-native';

/**
 * Contrato privado TS ↔ Kotlin, lido pelo Codegen.
 * Não importar fora de `src/native.ts`.
 */
export interface Spec extends TurboModule {
  getNfcStatus(): Promise<string>;
  openNfcSettings(): void;

  readonly onNfcStatusChange: CodegenTypes.EventEmitter<string>;
}

export default TurboModuleRegistry.get<Spec>('Cashtap');
