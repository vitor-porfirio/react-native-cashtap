# Workflow — gate por fase

O trabalho é dividido nas fases F1..F8 da especificação (§8). Cada fase segue este ciclo, sem exceção:

1. **Branch** `fase/fN-<nome>` a partir da `main` atualizada.
2. **Implementar** as histórias da fase, respeitando todas as rules.
3. **Testes unitários** para todo código que não depende de hardware (ver [testing.md](testing.md)).
4. **Rodar localmente** a bateria completa de verificação (comandos no `CLAUDE.md`). Só seguir com tudo verde.
5. **QA** — invocar o agente `qa` informando a fase, as issues e os critérios de aceite. O QA executa os comandos de novo, por conta própria.
6. **Tech Lead** — invocar o agente `tech-lead` com a fase, as issues e o diff (`git diff main...HEAD`).
7. **Corrigir** todo achado bloqueante e voltar ao passo 4. Repetir até os dois responderem `APROVADO`.
8. **PR** para a `main` com o checklist de DoD (abaixo) e os pareceres resumidos. Merge com squash desligado (manter histórico de commits).
9. **Issues**:
   - Critério 100% verificável sem hardware → fechar com comentário de evidência (testes que cobrem).
   - Critério que exige celular/cartão → label `validar-no-device` + comentário com o roteiro de teste do [docs/validacao-device.md](../../docs/validacao-device.md). Fica aberta para o Vitor.
10. **DECISIONS.md** atualizado com toda decisão relevante tomada na fase.

## Definition of Done da fase

- [ ] `yarn typecheck`, `yarn lint`, `yarn test` verdes
- [ ] `testDebugUnitTest` e `assembleDebug` verdes
- [ ] Toda regra RN-xx tocada pela fase tem teste que a referencia no nome (`RN-07: ...`)
- [ ] Nenhum dado sensível em log (ver [security.md](security.md))
- [ ] Tipos públicos atualizados e exportados quando a API muda
- [ ] Docs e `DECISIONS.md` atualizados
- [ ] QA: APROVADO · Tech Lead: APROVADO

## Quando um agente reprova

- Achado bloqueante: corrigir sempre.
- Achado não bloqueante: corrigir, ou registrar no PR por que não (com justificativa técnica).
- Discordância com o agente: registrar o argumento no PR. Não ignorar silenciosamente.

## Limite

Nada é marcado como "validado no device" sem o Vitor ter testado. Testes com fixtures sintéticos provam o código, não o comportamento de cartões reais.
