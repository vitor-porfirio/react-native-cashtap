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
| 2.10 | Com a cobrança aguardando, aproximar o cartão e medir no diagnóstico a hora da detecção | Detecção em menos de 1 s; **sem** o som de NFC do sistema | |
| 2.11 | Cancelar a cobrança e aproximar o cartão logo depois | Nada acontece (nenhum evento após desligar o reader mode) | |
| 2.12 | Iniciar e cancelar duas cobranças seguidas, rapidamente | Sem crash; a terceira cobrança funciona normalmente | |
| 2.13 | Afastar e reaproximar o cartão em menos de 1 s durante a leitura | A leitura conclui na reaproximação, sem esperar o timeout (D017) | |
| 2.14 | Exportar o diagnóstico de uma leitura Visa e de uma Mastercard e anexar nas issues #11/#13 | Estrutura real dos cartões. Para virar vetor em `Fixtures.kt`, os `**` são trocados por valores sintéticos (PAN de teste), preservando tag e comprimento | |

Issues: #8 (2.1, 2.7, 2.10–2.12), #9 (2.1, 2.6, 2.8, 2.13), #11 e #13 (2.3, 2.4, 2.14), #14 e #15 (2.3), #16 e #17 (2.1, 2.2, 2.9), #23 (2.5). #6, #10 e #12 são cobertas por testes unitários.

Se o GPO de algum cartão responder `6985` ou `6984`: exporte o diagnóstico e mande o comando GPO e a resposta do SELECT AID (já mascarados) — o ajuste é nos valores de terminal da D013.

---

## F5 — Fluxo: timeout, retentativa e cancelamento (#20, #21)

Execute junto com a F6/F7 (pela tela de cobrança do example). Deixe o `adb logcat -s CashTap ReactNativeJS` aberto.

| # | Passo | Esperado | OK? |
|---|---|---|---|
| 5.1 | Cobrar e não aproximar nada por 30 s | Tela "Tempo esgotado"; resultado `TIMEOUT` no app | |
| 5.2 | Logo depois de 5.1, aproximar o cartão | **Nada acontece**: nenhuma leitura, nenhum som, nada no logcat (reader mode desligado) | |
| 5.3 | Cobrar, aproximar e tocar "Cancelar" enquanto lê | Botão vira "Cancelando…"; resultado `cancelado`; a próxima cobrança funciona normalmente (canal IsoDep fechado) | |
| 5.4 | Cobrar e afastar o cartão no meio da leitura 3 vezes seguidas (padrão: 2 retentativas) | Duas telas "Não foi possível ler" com "Tentativa 2 de 3" e "3 de 3"; na terceira falha, erro `READ_FAILED_MAX_RETRIES` | |
| 5.5 | Cobrar, aguardar a tela "Aproxime o cartão" e desligar o NFC pelo painel rápido | Muda na hora para "NFC desligado" (sem esperar o timeout) | |
| 5.6 | Na tela de 5.5, ligar o NFC pelo painel rápido | Volta sozinho para "Aproxime o cartão" (reverificação) e a leitura funciona | |
| 5.7 | Cobrar, aproximar e desligar o NFC durante a leitura | Termina em "NFC desligado" (não em tempo esgotado) | |
| 5.8 | Cobrar com o NFC desligado e tocar "Cancelar" na tela de NFC desligado | Resultado `NFC_DISABLED` no app; modal fecha | |

Issues: #20 (5.1, 5.2, 5.4), #21 (5.3, 5.8) e RN-02/D018 (5.5–5.7).

---

## F6/F7 — Interface do SDK e app de exemplo (#24–#28)

| # | Passo | Esperado | OK? |
|---|---|---|---|
| 6.1 | Abrir o app | Tela de cobrança escura com chip "NFC pronto" (ou desligado/sem NFC, conforme o aparelho) | |
| 6.2 | Digitar 12890 no teclado, testar "00" e o apagar; segurar o apagar | R$ 128,90; "00" multiplica por 100; segurar zera | |
| 6.3 | Tocar "Cobrar R$ 128,90" | Modal desliza de baixo; valor, "Leitura segura", celular com ondas e cartão animado | |
| 6.4 | Aproximar o cartão | Vibração curta; "Lendo cartão… não afaste"; barra avança por Conexão → Aplicação → Autorização → Dados. Com cartão cujo PPSE responde 6A82, a barra começa em Aplicação (3 de 4 etapas) | |
| 6.5 | Concluir a leitura | Check verde com vibração dupla; cartão mascarado e validade; modal fecha sozinho em ~1,5 s | |
| 6.6 | Tela de resultado | Cartão ilustrado com número mascarado, duração, tentativas; "JSON para o backend" abre e compartilha (sem PAN completo) | |
| 6.7 | Cobrar com um cartão não aceito (crachá/transporte) | Tela de erro com código; no app, "Tentar novamente" cobra de novo o mesmo valor | |
| 6.8 | Ligar "Remover animações" (Acessibilidade) e cobrar | Telas estáticas, sem loops | |
| 6.9 | Abrir "Diagnóstico" após uma leitura | Criptograma retornado (sim/não), tempo total e, abaixo, "Leitura do cartão" (t_ciclo); barras por etapa, linha do tempo e log mascarado; "Exportar" compartilha o texto | |
| 6.10 | Abrir "Ensaios", escolher sessão/bandeira e registrar 2 leituras; voltar à cobrança e reabrir "Ensaios" | Contador x/30, estatísticas, lista; as leituras continuam lá depois de voltar; "Exportar CSV" gera colunas do Apêndice B (`desfecho`, `t_ciclo`, `t_total`…) | |
| 6.11 | Tirar print das telas de 6.3–6.6 e 6.9 | Material da Figura 6 do TCC (nenhum número completo aparece) | |
| 6.12 | Navegação por 3 botões (Configurações › Sistema › Gestos) em Android 15: cobrar e olhar o modal e a tela de cobrança | "Cancelar"/"Fechar" e "Cobrar" inteiros acima da barra de navegação; cabeçalho abaixo da status bar | |
| 6.13 | Com o modal aberto, tocar "Voltar" do Android em Aguardando, Lendo e NFC desligado | Aguardando/NFC desligado: cancela e fecha. Lendo: passa a "Cancelando…" e fecha ao fim do comando | |
| 6.14 | Ligar o TalkBack e cobrar | Cada troca de estado é falada ("Aproxime o cartão", "Lendo cartão…", "Cartão lido"); foco fica no modal; a barra é lida como progresso | |
| 6.15 | Desligar o NFC e cobrar; depois tocar "Verificar novamente" com o NFC ainda desligado | O modal abre direto em "NFC desligado" sem piscar "Verificando…"; na reverificação o modal continua aberto | |
| 6.16 | (Se houver aparelho sem NFC) cobrar | Nenhuma folha aparece, nem por um instante; o app mostra "Aparelho sem NFC" sem "Tentar novamente" | |
| 6.17 | Tamanho da fonte do sistema no máximo (200%) | Valor e botões legíveis, sem texto cortado nas ações | |
| 6.18 | Contraste: trocar o tema do exemplo para claro / "Feira Verde" (se exposto) ou validar pelos prints | Texto secundário e bordas visíveis sobre o fundo claro | |

Issues: #24 (6.3, 6.16), #25 (6.3–6.5, 6.7, 6.12–6.15), #26 (temas: ver testes; visual em 6.3, 6.18), #27 (6.1–6.7, 6.10), #28 (6.9).
