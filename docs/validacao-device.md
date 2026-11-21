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
