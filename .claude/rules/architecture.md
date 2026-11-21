# Arquitetura

## Camadas (especificação §2.2)

| Camada | Onde | Responsabilidade |
|---|---|---|
| UI | `src/ui/` | Renderiza o estado atual; captura cancelamento. Não decide fluxo. |
| Orquestração | `src/core/` | Máquina de estados, timeout, retentativa, montagem do resultado. |
| API pública | `src/index.ts`, `src/api.ts`, `src/types.ts`, `src/errors.ts` | Superfície mínima para o integrador. |
| Ponte | `src/NativeCashtap.ts` + `CashtapModule.kt` | Operações atômicas e eventos. Sem memória de fluxo. |
| Sessão NFC | `android/.../nfc/` | Reader mode, ciclo de vida, IsoDep. |
| Diálogo EMV + parsing | `android/.../emv/` | APDU, TLV, PPSE→AID→GPO→READ RECORD, extração. |

## Regras

1. **A máquina de estados fica no TS** (especificação §2.3). O Kotlin expõe operações atômicas (`getNfcStatus`, `openNfcSettings`, `startReaderMode`, `stopReaderMode`, `readCard`, `cancelRead`) e emite eventos (`onNfcStatusChange`, `onTagDetected`, `onDiagnostic`). Nenhuma política (timeout, retentativa, mensagens) no Kotlin.
2. **Núcleo puro vs. casca.** `src/core/machine.ts` é uma função pura `(state, event) → {state, effects}`. Efeitos (timers, chamadas nativas) ficam no runner. Em Kotlin, `emv/` não importa `android.*`: depende da interface `Transceiver`, de `Clock` e de `Logger`. Isso permite testar tudo na JVM.
3. **Sem bibliotecas de terceiros** para EMV, TLV, APDU ou NFC (especificação §12.5). Material de referência pode ser estudado e citado em `DECISIONS.md`, nunca adicionado como dependência.
4. **Dependências mínimas.** Nenhuma dependência de runtime nova no pacote sem decisão registrada. Dev dependencies para testes são aceitáveis.
5. **Direção de dependência:** example → lib. A lib nunca importa nada do `example/`. O `example/` só importa de `'react-native-cashtap'` (nunca de `src/...`).
6. **Contrato nativo trafega tipos simples.** Estruturas complexas atravessam como JSON string e são validadas no TS (especificação §2.4).
7. **Inversão de controle.** O integrador chama `capture()` e recebe um desfecho. Ele não desenha telas, não orquestra etapas e não conhece APDU/TLV/AID. Personalização visual nunca altera transições.
8. **Plataforma.** Fora do Android, a API responde `UNSUPPORTED` sem tocar no módulo nativo (nunca crasha no import). No Android, módulo nativo ausente é erro de instalação explícito (`LINKING_ERROR`, D010).

## Estrutura de pastas

```
src/
  index.ts            reexporta a API pública
  api.ts              capture, cancel, getNfcStatus, onNfcStatusChange, openNfcSettings, onStateChange
  types.ts            tipos públicos
  errors.ts           catálogo de erros (código, mensagem pt-BR, recuperável)
  NativeCashtap.ts    spec do Turbo Module (privada)
  native.ts           acesso guardado ao módulo + validação da fronteira
  core/               máquina de estados, runner, parâmetros, máscara
  ui/                 Provider, modal, views por estado, tema
android/src/main/java/com/cashtap/
  CashtapModule.kt    ponte
  nfc/                NfcSessionManager, IsoDepTransceiver
  emv/                Hex, Apdu, TlvParser, EmvTags, AidRegistry, PdolBuilder, EmvOrchestrator, CardDataExtractor, Masking
  model/              DTOs internos
android/src/test/java/com/cashtap/   testes JVM
```
