# Protocolo dos ensaios de validação

Protocolo da issue #32 (TCC §3.5 e Apêndice B), escrito **antes** da coleta. Mudanças depois de iniciada a coleta são registradas no fim deste arquivo, com data e motivo.

## Objetivo

Medir, com cartões reais, a taxa de leitura bem-sucedida e o tempo de cada etapa do diálogo EMV feito pelo SDK, separadamente para Visa e Mastercard.

## Hipóteses

- H1: a taxa de sucesso (sucesso + recuperado) é ≥ 95% por bandeira.
- H2: o ciclo de leitura (`t_ciclo`, da detecção ao resultado) tem mediana < 1 s.

## Amostra

| | Sessão 1 | Sessão 2 | Sessão 3 | Total |
|---|---|---|---|---|
| Visa | 10 | 10 | 10 | 30 |
| Mastercard | 10 | 10 | 10 | 30 |
| **Total** | 20 | 20 | 20 | **60** |

Sessões em dias diferentes, para captar variação de ambiente e de bateria.

## Material

- Um celular Android com NFC. Anotar modelo, versão do Android e nível de bateria no início de cada sessão.
- Um cartão Visa e um Mastercard contactless. Anotar só a bandeira e o tipo (crédito/débito): **nunca** o número.
- App de exemplo instalado a partir do commit da `main` em uso: `yarn example android --mode release --active-arch-only`. Anotar o hash do commit (`git rev-parse --short HEAD`).

## Condições controladas

- Capinha removida (ou a mesma capinha em todas as sessões, anotada).
- Cartão encostado na traseira, centralizado sobre a antena (posição indicada pela animação do modal), sem movimento até o "Cartão lido".
- Celular apoiado na mesa, tela ligada, sem outro cartão ou objeto metálico a menos de 10 cm.
- Valor fixo de R$ 1,00 (definido pela tela de ensaios).
- Nenhum outro app de pagamento por aproximação ativo como padrão de NFC.

## Procedimento por sessão

1. Abrir o app › **Ensaios**. Selecionar a sessão (1, 2 ou 3).
2. Selecionar **Visa**. Repetir 10 vezes:
   1. Tocar **Nova tentativa**.
   2. Aproximar o cartão nas condições acima e mantê-lo até o modal fechar.
   3. Afastar o cartão e aguardar 3 s antes da próxima tentativa.
3. Selecionar **Mastercard** e repetir o passo 2.
4. Tocar **Exportar CSV** e salvar o arquivo como `docs/ensaios/dados/sessao-<n>-<AAAA-MM-DD>.csv`.
5. Preencher a linha da sessão em [dados/README.md](dados/README.md).

Toda tentativa iniciada é registrada, inclusive as que falham. Uma tentativa só é descartada se o operador a cancelar por erro de procedimento (ex.: aproximou o cartão errado). O descarte é anotado com o motivo e a tentativa é refeita.

## Classificação do desfecho

Gerada pelo SDK (`toMeasurementRow`), coluna `desfecho`:

| Valor | Significado |
|---|---|
| `sucesso` | dados obtidos na primeira leitura |
| `recuperado` | dados obtidos após retentativa automática (cartão afastado cedo, falha recuperável) |
| `falha` | encerrou em erro; categoria na coluna `categoria` (código do catálogo) |
| `expirado` | ninguém aproximou o cartão no tempo (indica erro de procedimento) |
| `cancelado` | cancelado pelo operador |

## Métricas

Por bandeira e no total:

- **Taxa de sucesso** = (sucesso + recuperado) / (tentativas − canceladas − expiradas).
- **Taxa de 1ª leitura** = sucesso / (mesmo denominador).
- **Falhas por categoria** (contagem por `categoria`).
- **Tempos** (só leituras com sucesso): mediana, p90, média e desvio-padrão de `t_ciclo`, `t_ppse`, `t_aid`, `t_gpo` e `t_read`. `t_total` e `t_deteccao` são relatados, mas dependem do tempo de reação do operador e não entram na comparação entre bandeiras.

Colunas do CSV:

| Coluna | Conteúdo |
|---|---|
| `n`, `sessao`, `cartao` | ordem da tentativa, sessão e bandeira escolhida na tela |
| `captura` | identificador da captura |
| `desfecho`, `categoria` | ver acima |
| `bandeira` | bandeira detectada pelo SDK (vazia em falha) |
| `tentativas` | leituras feitas, contando as retentativas |
| `t_deteccao` | do início da captura à detecção do cartão lido (ms) |
| `t_ciclo` | da detecção ao resultado da leitura (ms) |
| `t_total` | do início ao desfecho (ms) |
| `t_ppse`, `t_aid`, `t_gpo`, `t_read` | duração de cada etapa do diálogo (ms) |

Nenhuma coluna contém número do cartão.

## Análise

```sh
node scripts/ensaios-resumo.mjs docs/ensaios/dados/*.csv
```

O script imprime as métricas acima em Markdown, pronto para o capítulo de resultados.

## Divergências

Se um cartão falhar de forma sistemática (ex.: `PROTOCOL_ERROR` no GPO), fazer uma captura extra com **Diagnóstico** ligado, exportar o texto (comandos já mascarados) e registrar o caso na tabela "Divergências spec EMV × cartão real" de [DECISIONS.md](../../DECISIONS.md). Não interromper a sessão: a tentativa conta como falha.

## Alterações do protocolo

| Data | Alteração | Motivo |
|---|---|---|
| — | — | — |
