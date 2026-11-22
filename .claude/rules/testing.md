# Testes

## O que exige teste unitário (obrigatório)

| Unidade | Ferramenta | Pasta |
|---|---|---|
| Hex, ApduBuilder, ResponseApdu | JUnit 4 | `android/src/test/java/com/cashtap/emv/` |
| TlvParser (1 byte, multi-byte, 81/82, aninhado, truncado) | JUnit 4 | idem |
| AidRegistry, PdolBuilder, AFL | JUnit 4 | idem |
| EmvOrchestrator com `FakeTransceiver` (Visa, Mastercard, 6A82, sem PDOL, cartão removido, bandeira não suportada) | JUnit 4 | idem |
| CardDataExtractor (5A, 57, 5F24, padding F, incompleto) | JUnit 4 | idem |
| Masking e mascaramento de APDU | JUnit 4 | idem |
| Máquina de estados (todas as transições da §4.2, INV-1..5) | Jest | `src/core/__tests__/` |
| Runner (timeout, retentativa, cancelamento, ALREADY_RUNNING) com fake timers e módulo nativo mockado | Jest | `src/core/__tests__/` |
| Validação de params, catálogo de erros, validação da fronteira | Jest | `src/__tests__/` |
| UI: uma view por estado, tema, textos customizados | Jest + @testing-library/react-native | `src/ui/__tests__/` |

Código que só existe para falar com hardware (`IsoDepTransceiver`, `NfcSessionManager`, `CashtapModule`) não tem teste unitário: é coberto pelo roteiro do `docs/validacao-device.md`. Mantê-lo fino.

## Convenções

- Nome do teste referencia a regra/invariante: `RN-15: 6A82 no PPSE tenta AID direto`.
- Vetores EMV ficam em `android/src/test/java/com/cashtap/emv/Fixtures.kt`, com PAN de teste e comentário de origem.
- Testes determinísticos: relógio e aleatoriedade injetados (`Clock`, `Random`), fake timers no Jest.
- Cobertura mínima: núcleo puro (`src/core`, `src/errors.ts`, `emv/`) ≥ 90% de linhas.

## Comandos

```bash
yarn test --coverage
cd example/android && ./gradlew :react-native-cashtap:testDebugUnitTest :react-native-cashtap:verifyEmvCoverage -PcashtapCoverage
```

`verifyEmvCoverage` só existe com `-PcashtapCoverage` (a cobertura fica desligada no build de quem instala o pacote) e falha se `com.cashtap.emv` tiver menos de 90% de linhas cobertas (relatório em `android/build/reports/coverage/test/debug/`).

Relatório Kotlin: `android/build/reports/tests/testDebugUnitTest/index.html`.
