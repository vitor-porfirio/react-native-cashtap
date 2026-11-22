# Arquitetura

Visão para quem vai manter o SDK. Para integrar, leia o [README](../README.md); para as decisões e o porquê de cada uma, [DECISIONS.md](../DECISIONS.md).

## Camadas

```
┌──────────────────────────── App integrador ────────────────────────────┐
│  capture({ amountCents })  →  Promise<CaptureResult>                   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ API pública (src/index.ts)
┌──────────────────────────────────▼─────────────────────────────────────┐
│ UI          src/ui/       CashTapProvider hospeda o CashTapModal;       │
│                           renderiza o estado, captura "Cancelar".       │
│ Orquestração src/core/    machine.ts (pura) + session.ts (runner)       │
│                           + controller.ts (sessão ativa, projeção p/ UI)│
│ Ponte (TS)  src/native.ts Acesso guardado ao Turbo Module e validação   │
│                           em runtime de tudo que vem do nativo.         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Turbo Module (Codegen, NativeCashtap.ts)
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Ponte (Kotlin)  CashtapModule.kt   operações atômicas + eventos         │
│ Sessão NFC      nfc/               reader mode, ciclo de vida, IsoDep   │
│ Diálogo EMV     emv/               APDU, TLV, PPSE→AID→GPO→READ RECORD  │
│                                    (Kotlin puro, sem android.*)         │
└─────────────────────────────────────────────────────────────────────────┘
```

| Camada | Sabe | Não sabe |
|---|---|---|
| UI | Estado atual, valor, tema, textos | Timeout, retentativa, APDU |
| Orquestração | Fluxo inteiro, políticas (timeout, retentativa, cancelamento) | Bytes, Activity, rádio |
| Ponte | Converter chamadas/eventos e validar formato | Fluxo (não tem memória entre chamadas) |
| Sessão NFC | Activity atual, reader mode, `Tag` | EMV, políticas |
| EMV | Protocolo e extração | Android, React Native, tempo de espera |

## Por que a máquina de estados fica no TypeScript

O fluxo (aguardar → ler → retentar → concluir) é política de produto. Mantê-lo no TS deixa o Kotlin com operações curtas e sem estado de fluxo, testáveis isoladamente, e permite testar todas as transições com fake timers, sem device ([D018](../DECISIONS.md)).

`machine.ts` é uma função pura `(snapshot, event) → { snapshot, effects }`. O runner (`session.ts`) executa os efeitos (iniciar/parar reader mode, ler, agendar timer) e realimenta a máquina com os eventos resultantes. Os eventos são enfileirados: um efeito nunca reentra na máquina durante uma transição.

## Contrato da ponte

| Operação | Retorno | Observação |
|---|---|---|
| `getNfcStatus()` | `Promise<string>` | `READY`, `DISABLED` ou `UNSUPPORTED` |
| `openNfcSettings()` | `void` | Tela de NFC; sem ela, a de conexões sem fio (RN-02) |
| `startReaderMode()` | `Promise<void>` | Rejeita com `NFC_UNSUPPORTED`, `NFC_DISABLED` ou `UNKNOWN` |
| `stopReaderMode()` | `Promise<void>` | Idempotente (RN-11) |
| `readCard(amountCents, currencyCode, diagnostics)` | `Promise<string>` (JSON) | Rejeita com código do catálogo; `src/native.ts` converte a rejeição em valor |
| `cancelRead()` | `void` | Verificado antes de cada APDU (RN-10) |
| evento `onTagDetected` | `{ detectedAt }` | Um cartão entrou no campo |
| evento `onNfcStatusChange` | status | Broadcast do sistema |
| evento `onDiagnostic` | `{ step, command, response, sw, durationMs }` | A cada comando (alimenta a barra de progresso). Com `diagnostics` falso, `command`/`response` vêm vazios; com verdadeiro, já mascarados na origem |

O resultado da leitura atravessa como JSON e são validadas campo a campo em `src/native.ts` (sem `as`); formato inesperado vira `PARSE_ERROR`. Detalhes em [D017](../DECISIONS.md).

## Diálogo EMV (Kotlin)

```
SELECT PPSE ──9000──► candidatas (61: 4F/50/87), ordenadas pela tag 87
     │ 6A82
     └──► AIDs conhecidos direto (RN-15)
SELECT AID ──► FCI: rótulo (50), PDOL (9F38)
GET PROCESSING OPTIONS ──► 80 (AIP+AFL) ou 77 (template)
READ RECORD × AFL ──► 5A, 57, 5F24, 5F34, 9F6B...
CardDataExtractor ──► PAN, validade, bandeira pelo AID; zera buffers (RN-26)
```

Comandos e tratamento de cada status word: [Apêndice C](tcc/apendice-c.md).

`emv/` depende só das interfaces `Transceiver`, `Clock` e `Logger`. Nos testes, `FakeTransceiver` reproduz cartões sintéticos (`Fixtures.kt`); no app, `IsoDepTransceiver` fala com o rádio.

## Threading

| Onde | Thread |
|---|---|
| `enableReaderMode` / `disableReaderMode` | UI thread (`runOnUiThread`) |
| `onTagDiscovered` | Binder do sistema: só guarda a `Tag` e emite o evento |
| `readCard` (todo o diálogo EMV) | Executor dedicado de thread única do módulo |
| Máquina de estados, runner, UI | Thread JS |

O executor é encerrado em `invalidate()`. Toda `Promise` é resolvida exatamente uma vez, inclusive em exceção inesperada.

## Segurança na arquitetura

- **Mascaramento na origem:** o diagnóstico é mascarado em `emv/Masking.kt`, antes de virar evento; o TS nunca recebe o comando em claro.
- **Allowlist:** só tags estruturais públicas aparecem em claro no diagnóstico ([D016](../DECISIONS.md)).
- **Projeção para a UI:** o modal recebe uma visão da sessão sem o PAN completo.
- **Superfície mínima:** diagnóstico e medições ficam em `react-native-cashtap/dev`, fora do entry principal ([D020](../DECISIONS.md)).
- **Sem rede e sem persistência:** nenhum módulo do pacote importa API de rede ou de armazenamento (verificado por grep no QA de cada fase).

## Testes

| Camada | Como | Onde |
|---|---|---|
| EMV, TLV, APDU, extração, máscara | JUnit 4 na JVM, sem device | `android/src/test/` |
| Máquina, runner, controller, params, erros, fronteira | Jest com fake timers e módulo nativo simulado | `src/**/__tests__/` |
| Modal, Provider, diagnóstico | Jest + Testing Library | `src/ui/__tests__/` |
| Rádio, Activity, cartão real | Roteiro manual | [validacao-device.md](validacao-device.md) |
