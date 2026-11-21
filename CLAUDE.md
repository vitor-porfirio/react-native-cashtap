# CashTap — instruções do projeto

SDK React Native (`react-native-cashtap`) que transforma um Android em leitor de cartão por aproximação (NFC/EMV). O app hospedeiro informa o valor; o SDK conduz o fluxo inteiro (UI, NFC, diálogo EMV, timeout, retentativa) e devolve `{pan, panMasked, expiry, brand, aid}` + metadados. Não faz rede, não autoriza pagamento. Só Android (D002).

Fontes de verdade, nesta ordem:
1. Especificação técnica (regras RN-01..27, máquina de estados, catálogo de erros, histórias E1..E8) — resumida em [docs/especificacao.md](docs/especificacao.md).
2. [DECISIONS.md](DECISIONS.md) — decisões já tomadas. Não reabrir sem motivo novo.
3. Issues do GitHub (#1..#32).

## Regras

Antes de qualquer alteração, ler e seguir [.claude/rules/](.claude/rules/):

| Arquivo | Assunto |
|---|---|
| [00-workflow.md](.claude/rules/00-workflow.md) | Gate por fase, QA + Tech Lead, PR |
| [architecture.md](.claude/rules/architecture.md) | Camadas, pastas, direção de dependência |
| [kotlin.md](.claude/rules/kotlin.md) | Camada nativa |
| [typescript-api.md](.claude/rules/typescript-api.md) | API pública e camada TS |
| [security.md](.claude/rules/security.md) | Dados de cartão, logs, rede |
| [testing.md](.claude/rules/testing.md) | O que testar e como rodar |
| [git-docs.md](.claude/rules/git-docs.md) | Commits, branches, documentação |

## Agentes de revisão

- `qa` ([.claude/agents/qa.md](.claude/agents/qa.md)) — executa todas as verificações e mapeia critérios de aceite a testes.
- `tech-lead` ([.claude/agents/tech-lead.md](.claude/agents/tech-lead.md)) — revisa o diff contra regras, especificação e padrões de SDK.

Nenhuma fase é mergeada sem `APROVADO` dos dois.

## Comandos

```bash
yarn typecheck && yarn lint && yarn test --coverage          # TS
cd example/android && ./gradlew :react-native-cashtap:testDebugUnitTest   # Kotlin (JVM, sem device)
cd example/android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
yarn example android --active-arch-only                       # instala no device
```

Ambiente: Node ≥ 22.11, JDK 17 (`JAVA_HOME`), RN 0.88, Nova Arquitetura.
