# Especificação — resumo operacional

Extraído de *CashTap — Especificação Técnica e Backlog de Produto* (v1.0) e da versão preliminar do TCC. Este arquivo é a referência dentro do repositório para implementação e revisão. Em conflito, vale o documento original, exceto onde o `DECISIONS.md` registrar decisão posterior.

## Escopo v1.0

**Dentro:** leitura de dados públicos de cartão EMV via NFC em Android (`IsoDep`); Visa e Mastercard; diálogo EMV próprio (SELECT PPSE → SELECT AID → GPO → READ RECORD); parser BER-TLV próprio; Turbo Module com Codegen; máquina de estados com timeout e retentativa; UI própria (modal) personalizável; catálogo de erros; app de exemplo; documentação.

**Fora:** autorização financeira e qualquer rede; validação de criptograma (9F26); iOS; PIN/CVM; certificação PCI MPoC / EMV L2-L3; persistência, histórico, comprovante; outras bandeiras; HCE; controles antifraude de produção (documentados, não implementados).

## Regras de negócio

| ID | Regra |
|---|---|
| RN-01 | Só inicia captura se há hardware NFC habilitado; senão retorna erro sem abrir a UI de leitura. |
| RN-02 | NFC presente mas desabilitado: orientar a habilitar nas configurações e oferecer reverificação. |
| RN-03 | Valor obrigatório, em centavos, inteiro, > 0. Inválido rejeita antes de acionar o rádio. |
| RN-04 | Um ciclo ativo por vez. Chamada concorrente → `ALREADY_RUNNING`. |
| RN-05 | Espera pela aproximação: 30 s padrão, parametrizável 10–120 s (fora da faixa → limite mais próximo). |
| RN-06 | Expirar sem aproximação é desfecho de expiração, distinto de erro técnico. |
| RN-07 | Cartão removido antes do fim do diálogo → falha recuperável; volta automaticamente à espera. |
| RN-08 | Retentativas automáticas: 2 padrão, parametrizável 0–5. Esgotadas → erro. |
| RN-09 | Cada retentativa reinicia o tempo de espera. |
| RN-10 | Cancelar a qualquer momento em WAITING_CARD ou RECOVERABLE_FAILURE. Em READING, aceito mas efetivado ao fim da operação atômica em curso. |
| RN-11 | O ciclo sempre encerra a sessão NFC e desativa o reader mode, qualquer que seja o desfecho. |
| RN-12 | Diálogo começa obrigatoriamente por SELECT PPSE. |
| RN-13 | PPSE com várias aplicações: seleciona a primeira com AID suportado (Visa, Mastercard). Nenhuma → `UNSUPPORTED_BRAND`. |
| RN-14 | Toda resposta tem ≥ 2 bytes (SW1SW2); menor → falha de protocolo. |
| RN-15 | Só `9000` é sucesso de etapa. `6A82` no PPSE → fallback: SELECT AID direto com os AIDs conhecidos. |
| RN-16 | GPO montado a partir do PDOL. Sem PDOL → dados `83 00`. |
| RN-17 | Registros a ler determinados pelo AFL (94). Sem varredura exaustiva. |
| RN-18 | PAN: prioriza 5A; senão 57 (dígitos antes do `D`). |
| RN-19 | Validade: 5F24 (AAMMDD); senão 57 (4 dígitos após o `D`). |
| RN-20 | Bandeira inferida pelo prefixo do AID, nunca pelo PAN. |
| RN-21 | Sem PAN ou validade ao final → `INCOMPLETE_DATA`, nunca sucesso parcial. |
| RN-22 | Nenhum dado do cartão é persistido. |
| RN-23 | Nenhum log contém PAN completo, Track 2 completo ou criptograma. Mascaramento na origem. |
| RN-24 | PAN completo entregue uma vez, no resultado, sempre junto do mascarado (6 + 4). |
| RN-25 | O SDK não faz chamada de rede. |
| RN-26 | Buffers sensíveis sobrescritos após compor o resultado, na medida do possível. |
| RN-27 | Criptograma (9F26) não exposto na API pública. |

## Máquina de estados (TS)

| Estado | Significado | UI |
|---|---|---|
| IDLE | Nenhum ciclo ativo | — |
| CHECKING | Verificando NFC | spinner |
| WAITING_CARD | Reader mode ativo | valor + "Aproxime o cartão" + animação |
| READING | Diálogo EMV em curso | "Lendo cartão... não afaste" |
| RECOVERABLE_FAILURE | Falha passível de nova tentativa | "Não foi possível ler. Tente novamente." |
| PROCESSING | Montando resultado | "Processando..." |
| SUCCESS | Resultado pronto | check + dados mascarados |
| CANCELLED | Operador cancelou | fecha |
| TIMEOUT | Expirou | "Tempo esgotado" |
| ERROR | Falha não recuperável | mensagem do catálogo |

**Transições**

| De | Evento | Para | Efeito |
|---|---|---|---|
| IDLE | `capture()` | CHECKING | valida params (RN-03, RN-04) |
| CHECKING | NFC pronto | WAITING_CARD | `startReaderMode()`, inicia timer |
| CHECKING | NFC ausente/desabilitado | ERROR | `NFC_UNSUPPORTED` / `NFC_DISABLED` |
| WAITING_CARD | tag detectada | READING | para timer; `readCard()` |
| WAITING_CARD | timer expirou | TIMEOUT | `stopReaderMode()` |
| WAITING_CARD | `cancel()` | CANCELLED | `stopReaderMode()` |
| READING | leitura ok | PROCESSING | — |
| READING | link perdido | RECOVERABLE_FAILURE | incrementa tentativas |
| READING | erro fatal | ERROR | `stopReaderMode()` |
| RECOVERABLE_FAILURE | tentativas < máx | WAITING_CARD | reinicia timer (RN-09) |
| RECOVERABLE_FAILURE | tentativas = máx | ERROR | `READ_FAILED_MAX_RETRIES` |
| RECOVERABLE_FAILURE | `cancel()` | CANCELLED | `stopReaderMode()` |
| PROCESSING | dados válidos | SUCCESS | monta resultado; limpa buffers |
| PROCESSING | dados incompletos | ERROR | `INCOMPLETE_DATA` |
| terminal | promise resolvida | IDLE | garante `stopReaderMode()` (RN-11) |

**Invariantes**

- INV-1: em estado terminal, reader mode desativado.
- INV-2: nunca dois ciclos ativos.
- INV-3: a promise de `capture()` resolve exatamente uma vez.
- INV-4: nenhuma transição para SUCCESS sem PAN e validade.
- INV-5: timer de espera ativo se e somente se o estado é WAITING_CARD.

## Catálogo de erros

| Código | Mensagem ao operador | Recuperável |
|---|---|---|
| NFC_UNSUPPORTED | Este aparelho não possui NFC e não pode receber pagamentos por aproximação. | Não |
| NFC_DISABLED | O NFC está desligado. Ative-o nas configurações do aparelho para continuar. | Sim (ação do usuário) |
| INVALID_AMOUNT | Valor de cobrança inválido. | Não |
| ALREADY_RUNNING | Já existe uma cobrança em andamento. | Não |
| CARD_REMOVED | O cartão foi afastado antes da leitura terminar. Aproxime novamente. | Sim (automático) |
| UNSUPPORTED_BRAND | Este cartão não é aceito. Tente um cartão Visa ou Mastercard. | Não |
| PROTOCOL_ERROR | Não foi possível se comunicar com o cartão. Tente novamente. | Sim (automático) |
| PARSE_ERROR | A resposta do cartão não pôde ser interpretada. | Sim (automático) |
| INCOMPLETE_DATA | Não foi possível obter todos os dados do cartão. | Não |
| READ_FAILED_MAX_RETRIES | Não conseguimos ler o cartão. Verifique o cartão e tente de novo. | Não |
| TIMEOUT | Tempo esgotado. Inicie a cobrança novamente. | Não |
| CANCELLED_BY_USER | (sem mensagem) | Não |
| UNKNOWN | Ocorreu um erro inesperado. | Não |

Diretrizes: falar com o operador (nunca "SW1SW2=6A82" na tela); indicar a próxima ação; não culpar usuário/cartão sem certeza; detalhe técnico vai em `detail`.

## API pública (decisão: inglês — D006)

Equivalência com o Apêndice A do TCC:

| Apêndice A (pt) | API |
|---|---|
| `capturar(p: CapturaParams)` | `capture(params: CaptureParams): Promise<CaptureResult>` |
| `cancelar()` | `cancel()` |
| `verificarDisponibilidade()` | `getNfcStatus(): Promise<NfcStatus>` |
| `aoMudarEstado(cb)` | `onStateChange(cb): Unsubscribe` |
| — (RN-02) | `onNfcStatusChange(cb): Unsubscribe`, `openNfcSettings()` (D009, D010) |
| — (E6-H1) | `<CashTapProvider>` hospeda o modal do SDK |
| `valorCentavos, moeda, referencia, timeoutMs, maxTentativas, aparencia` | `amountCents, currencyCode, reference, timeoutMs, maxRetries, appearance` |
| status `sucesso/cancelado/erro` | `success / cancelled / timeout / error` |
| `DadosCartao {pan, panMascarado, validade, bandeira, rotuloAplicacao, aid, sequencialCartao}` | `CardData {pan, panMasked, expiry, brand, applicationLabel, aid, panSequenceNumber}` |
| `MetaCaptura {idCaptura, iniciadoEm, duracaoMs, tentativas}` | `CaptureMeta {captureId, startedAt, durationMs, attempts, ...}` |
| `ErroCashTap {codigo, mensagem, detalhe}` | `CashTapError {code, message, detail, recoverable}` |

## Histórias e fases

| Fase | Histórias | Issues | Marco |
|---|---|---|---|
| F1 Fundação | E1-H1..H3 | #3 #4 #5 | TS → Kotlin → TS com evento |
| F2 Rádio | E2-H1..H3 | #6 #7 #8 #9 | cartão detectado, APDU trocado |
| F3 Diálogo | E3-H1..H5 | #10..#15 | 4 etapas com 9000 nos dois cartões |
| F4 Dados | E4-H1..H3 | #16 #17 #23 | PAN e validade nas duas bandeiras |
| F5 Fluxo | E5-H1..H4 | #18..#22 | ciclo com timeout, retentativa, cancelamento |
| F6 Interface | E6-H1..H3 | #24 #25 #26 | fluxo conduzido pela UI do SDK |
| F7 Demo | E7-H1..H3 | #27 #28 | example apresentável, prova de opacidade |
| F8 Validação | E8-H1..H3 | #29..#32 | 60 ensaios consolidados |

Critérios de aceite relevantes por história (resumo):

- **E1-H2:** Codegen gera as interfaces; Kotlin implementa a interface gerada; `getNfcStatus()` reflete o estado real.
- **E1-H3:** listener recebe payload; após remover, não é chamado.
- **E2-H2:** `onTagDetected` < 1 s; após `stopReaderMode` nenhum evento; background desliga, foreground religa se o ciclo estiver ativo. Flags NFC A e B + supressão de som.
- **E2-H3:** APDU arbitrário com resposta; conexão fechada mesmo com exceção; tag sem IsoDep → `UNSUPPORTED_BRAND`; cartão afastado → link perdido, sem exceção no JS.
- **E3-H1:** Lc calculado; omitido sem dados.
- **E3-H4:** cada elemento do PDOL com o comprimento exato; dados encapsulados em `83`; sem PDOL → `83 00`; resposta com AIP (82) e AFL (94). Valor pode ir zerado ou real.
- **E3-H5:** AFL → pares (SFI, registro); erro em registro individual não aborta se os dados obrigatórios forem obtidos.
- **E4-H1:** 1 byte, multi-byte, 81/82, aninhado em qualquer profundidade, malformado falha controlada.
- **E4-H2:** 5A sem padding F; 57 antes do D; validade 4 dígitos após D; 5F24 → AAMM; sem PAN → `INCOMPLETE_DATA`.
- **E4-H3:** nenhum PAN completo/Track2/criptograma em log; nada gravado; `panMasked` no formato `123456******7890`; nenhuma requisição de rede.
- **E5-H2:** timeout fora da faixa → ajustado ao limite.
- **E5-H3:** `maxRetries = 2` e 3 falhas → `READ_FAILED_MAX_RETRIES`; `maxRetries = 0` → erro na primeira falha.
- **E6-H1:** modal sobre o app; valor formatado em moeda; fecha ao resolver.
- **E6-H2:** animação em WAITING_CARD; feedback visual e vibração no sucesso.
- **E6-H3:** cores primária/fundo/texto aplicadas; tema padrão sem config; textos customizados com fallback.
- **E7-H1:** digitar valor + "Cobrar"; sucesso mostra PAN mascarado, bandeira, validade e JSON do payload; erro mostra código e mensagem.
- **E7-H2:** example sem "APDU", "TLV", "AID", "PPSE", "IsoDep" ou tags; integração < 10 linhas.
- **E7-H3:** diagnóstico (dev): transições em ordem, tempos por etapa, APDUs mascarados.
- **E8-H2:** `meta` com duração total e tentativas; tempos das 4 etapas exportáveis em tabela; relógio monotônico.
- **E8-H3:** README permite integrar; seção de limitações explícita.

## Notas de implementação

- Manifesto da lib declara permissão NFC e `uses-feature` NFC **não obrigatória**.
- APDU nunca na main thread; eventos para o JS emitidos na thread adequada.
- 9F26: no diagnóstico, registrar só a presença.
- Fixtures: respostas reais capturadas devem ter PAN alterado antes de virar vetor de teste.
