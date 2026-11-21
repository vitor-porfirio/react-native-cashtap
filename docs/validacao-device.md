# Validação no dispositivo físico

Roteiro do que **só** pode ser verificado com celular Android e cartões reais. Os testes unitários provam o código; este roteiro prova o comportamento no hardware. Cada bloco corresponde a issues com o label `validar-no-device`: execute, anote o resultado na issue e feche-a se tudo passar.

## Preparação

1. Celular Android com NFC, depuração USB ligada, aparecendo em `adb devices`.
2. Na raiz do repo: `yarn` e depois `yarn example android --active-arch-only`.
3. Num segundo terminal, acompanhe o log do SDK: `adb logcat -s CashTap ReactNativeJS`.
4. Cartões: um Visa e um Mastercard contactless, de titularidade própria.
5. Localize a antena NFC do aparelho (geralmente no centro ou no topo da traseira).

Em qualquer falha, copie as linhas do logcat e, a partir da F7, o export da tela de diagnóstico (APDUs já mascarados) e cole na issue.

---

## F1 — Fundação (#3, #5)

| # | Passo | Esperado | OK? |
|---|---|---|---|
| 1.1 | Abrir o example com NFC **ligado** | Tela mostra `READY` | |
| 1.2 | Fechar o app, desligar o NFC, abrir de novo | Mostra `DISABLED` e o botão "Abrir configurações" | |
| 1.3 | Tocar "Abrir configurações" | Abre a tela de **NFC** do sistema (não a de rede sem fio) | |
| 1.4 | Com o app aberto, ligar o NFC nas configurações e voltar | A tela muda sozinha para `READY`, sem tocar em nada | |
| 1.5 | Com o app aberto, desligar o NFC | Muda sozinha para `DISABLED` | |
| 1.6 | No logcat, durante 1.4/1.5 | Um único evento por mudança (sem `DISABLED` repetido) | |
| 1.7 | Recarregar o JS (`R` duas vezes no Metro) três vezes e repetir 1.4/1.5 | Continua uma atualização por mudança; nenhum crash | |
| 1.8 | Fechar o app pelo multitarefa e reabrir | Sem crash; no logcat, nenhum `IntentReceiver ... leaked` nem `Receiver not registered` | |
| 1.9 | (Opcional) Aparelho/emulador sem NFC | Mostra `UNSUPPORTED` | |

Issue #3: passos 1.1–1.3. Issue #5: passos 1.4–1.8.

---

## F2–F4 — Rádio, diálogo EMV e dados (#6–#17, #23)

O fluxo completo de leitura só fica acessível pela UI do SDK a partir da F6. Execute esta seção junto com a da F6/F7, usando a **tela de diagnóstico** do example.

| # | Passo | Esperado | OK? |
|---|---|---|---|
| 2.1 | Iniciar uma cobrança e aproximar o cartão **Visa** | Leitura conclui; bandeira `visa`, PAN mascarado `xxxxxx******xxxx`, validade correta | |
| 2.2 | Repetir com o **Mastercard** | Idem, bandeira `mastercard` | |
| 2.3 | Na tela de diagnóstico, conferir as 4 etapas | SELECT PPSE, SELECT AID, GPO e READ RECORD com SW `9000` (READ RECORD pode ter registros `6A83`, sem abortar) | |
| 2.4 | Exportar o diagnóstico e colar a resposta do PPSE no emvlab.org | Estrutura 6F/A5/BF0C/61/4F decodifica sem erro | |
| 2.5 | Procurar o PAN completo no export e no `adb logcat -s CashTap` | **Nenhuma** ocorrência (só a versão mascarada) | |
| 2.6 | Aproximar e afastar o cartão rapidamente, no meio da leitura | SDK mostra "aproxime novamente" e lê na aproximação seguinte (RN-07) | |
| 2.7 | Com a cobrança aguardando cartão, apertar Home e voltar ao app | Leitura continua funcionando ao voltar (reader mode religado) | |
| 2.8 | Com a cobrança aguardando cartão, aproximar um cartão de transporte/crachá | Erro de cartão não aceito, sem crash | |
| 2.9 | Anotar em `DECISIONS.md` (tabela de divergências) qualquer etapa com SW diferente de 9000 | — | |

Issues: #8 (2.1, 2.7), #9 (2.1, 2.6, 2.8), #11 e #13 (2.3, 2.4), #14 e #15 (2.3), #16 e #17 (2.1, 2.2, 2.9), #23 (2.5). #6, #10 e #12 são cobertas por testes unitários.

Se o GPO de algum cartão responder `6985` ou `6984`: exporte o diagnóstico e mande o comando GPO e a resposta do SELECT AID (já mascarados) — o ajuste é nos valores de terminal da D013.
