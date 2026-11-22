# Protocolo dos ensaios de validação

Protocolo da issue #32 (TCC §3.5 e Apêndice B), escrito **antes** da coleta. Qualquer mudança feita depois do início da coleta é registrada no fim deste arquivo, com data e motivo.

## Objetivo

Medir, com cartões reais, a taxa de leitura bem-sucedida e o tempo de cada etapa do diálogo EMV conduzido pelo SDK, para Visa e para Mastercard.

## Hipóteses

- H1: a taxa de sucesso (sucesso + recuperado) é ≥ 95% por bandeira.
- H2: o ciclo de leitura (`t_ciclo`, do início da leitura ao resultado) tem mediana < 1 s.

As hipóteses são avaliadas de forma **descritiva**: relata-se a taxa com o intervalo de confiança de 95% de Wilson e a mediana com p90. Com n = 30 por bandeira a taxa anda em degraus de 3,3 pontos (uma falha = 96,7%, duas = 93,3%), e mesmo 30/30 tem IC de aproximadamente 88,6–100%. Por isso o resultado é apresentado como estimativa com incerteza, não como teste de significância.

## Amostra

| | Sessão 1 | Sessão 2 | Sessão 3 | Total |
|---|---|---|---|---|
| Visa | 10 | 10 | 10 | 30 |
| Mastercard | 10 | 10 | 10 | 30 |
| **Ordem** | Visa → Mastercard | Mastercard → Visa | Visa → Mastercard | |
| **Total** | 20 | 20 | 20 | **60** |

São 20 tentativas **válidas** por sessão (tentativas descartadas são refeitas; ver "Descartes"). As sessões acontecem em dias diferentes, para captar variação de ambiente e de bateria. A ordem das bandeiras alterna entre as sessões para não confundir bandeira com aquecimento do aparelho, queda de bateria ou cansaço do operador.

## Material

- Um celular Android com NFC. Anotar modelo, versão do Android e nível de bateria no início de cada sessão.
- Um cartão Visa e um Mastercard contactless. Anotar só a bandeira e o tipo (crédito/débito): **nunca** o número.
- App de exemplo instalado a partir do commit da `main` em uso: `yarn example android --mode release --active-arch-only`. Anotar o hash (`git rev-parse --short HEAD`).

## Condições controladas

- **Posição da antena marcada antes da 1ª sessão:** deslizar o cartão pela traseira com a tela de cobrança aberta até achar o ponto em que a detecção é imediata e marcar esse ponto com fita. Todas as aproximações usam essa marca. A ilustração do modal é genérica e não indica a antena do aparelho.
- Capinha removida (ou a mesma capinha em todas as sessões, anotada).
- Cartão encostado sobre a marca e parado até o modal fechar.
- Celular apoiado na mesa, tela ligada, sem outro cartão ou objeto metálico a menos de 10 cm.
- Valor fixo de R$ 1,00 (definido pela tela de ensaios).
- Diagnóstico ligado (a tela de ensaios usa `diagnostics: true`). O mascaramento acontece fora do cronômetro das etapas, então não altera os tempos medidos.
- Nenhum outro app de pagamento por aproximação definido como padrão de NFC.

## Procedimento por sessão

1. Abrir o app › **Ensaios** e selecionar a sessão (1, 2 ou 3).
2. Selecionar a primeira bandeira da ordem da sessão. Repetir até completar 10 tentativas válidas:
   1. Tocar **Nova tentativa**.
   2. Aproximar o cartão sobre a marca e mantê-lo até o modal fechar.
   3. Afastar o cartão e aguardar 3 s antes da próxima tentativa.
3. Tocar **Exportar sessão N** e salvar como `docs/ensaios/dados/sessao-<n>-<AAAA-MM-DD>-<bandeira>.csv` (ex.: `sessao-1-2026-12-01-visa.csv`). Um arquivo por bloco, nunca por cima do anterior: se o app fechar entre os blocos, a exportação seguinte traz só o que ficou em memória, e o arquivo do bloco anterior continua salvo. Arquivos que se sobrepõem não causam contagem dupla, porque o script ignora capturas repetidas.
4. Repetir os passos 2 e 3 com a outra bandeira.
5. Registrar os descartes (se houver) e preencher a linha da sessão em [dados/README.md](dados/README.md).

A exportação traz só as tentativas da sessão selecionada, mesmo que o app tenha ficado aberto desde a sessão anterior. O script de análise ignora linhas repetidas entre arquivos (mesma `captura`) e aborta se a mesma captura aparecer com dados diferentes.

## Descartes

Toda tentativa iniciada fica registrada no CSV. Uma tentativa só é **descartada** por erro de procedimento do operador, por exemplo: cartão errado aproximado, cartão fora da marca, operador cancelou ou se afastou. A tentativa descartada é anotada em `dados/descartes.csv` (`captura,motivo`) e **refeita**.

- **Cancelada** é sempre ação do operador e precisa constar em `descartes.csv`. Se não constar, o script conta como falha e avisa.
- **Expirada** com o cartão corretamente posicionado sobre a marca é **falha de detecção** (`TIMEOUT`) e entra no denominador. Só é descartada se o operador anotar o erro de procedimento que a causou.

## Classificação do desfecho

Gerada pelo SDK (`toMeasurementRow`), coluna `desfecho`:

| Valor | Significado | Entra no denominador? |
|---|---|---|
| `sucesso` | dados obtidos na primeira leitura | sim |
| `recuperado` | dados obtidos após retentativa automática (falha recuperável) | sim |
| `falha` | erro; a categoria vem na coluna `categoria` (código do catálogo) | sim |
| `expirado` | nenhuma detecção em 30 s: falha de detecção | sim, salvo descarte anotado |
| `cancelado` | cancelado pelo operador | não, se constar em `descartes.csv` |

## Métricas

Por bandeira e no total, sobre as tentativas válidas (todas as tentativas menos as descartadas):

- **Taxa de sucesso** = (sucesso + recuperado) / válidas, com IC 95% de Wilson.
- **Taxa de 1ª leitura** = sucesso / válidas, com IC 95% de Wilson.
- **Falhas por categoria**: contagem por `categoria`; expirado aparece como `TIMEOUT (não detectado)`.
- **Tempos** (só leituras com sucesso): mediana, p90, média e desvio-padrão de `t_ciclo`, `t_ppse`, `t_aid`, `t_gpo` e `t_read`.
- **Overhead** = `t_ciclo` − (`t_ppse` + `t_aid` + `t_gpo` + `t_read`): custo da ponte nativa, da extração e do runner fora do diálogo com o cartão.
- `t_deteccao` e `t_total` são relatados, mas dependem do tempo de reação do operador e não entram na comparação entre bandeiras.

Colunas do CSV:

| Coluna | Conteúdo |
|---|---|
| `n`, `sessao`, `cartao` | ordem da tentativa, sessão e bandeira escolhida na tela |
| `captura` | identificador da captura |
| `desfecho`, `categoria` | ver acima |
| `bandeira` | bandeira detectada pelo SDK (vazia em falha) |
| `tentativas` | leituras feitas, contando as retentativas |
| `t_deteccao` | do início da captura à detecção da aproximação que teve sucesso (ms) |
| `t_ciclo` | do início da leitura bem-sucedida ao resultado (ms) |
| `t_total` | do início ao desfecho (ms) |
| `t_ppse`, `t_aid`, `t_gpo`, `t_read` | duração de cada etapa do diálogo (ms) |

Nenhuma coluna contém número do cartão.

## Análise

```sh
node scripts/ensaios-resumo.mjs docs/ensaios/dados/*.csv
```

O script lê os CSVs das sessões e o `descartes.csv` e imprime as tabelas em Markdown, com vírgula decimal, prontas para o capítulo de resultados. Método: quantis por interpolação linear (tipo 7, o padrão do R e do NumPy), desvio-padrão amostral (n − 1) e intervalo de Wilson de 95%.

## Ameaças à validade

- **Um cartão por bandeira:** comparar bandeiras é, na prática, comparar dois cartões (emissor, chip, aplicação). As diferenças observadas não se generalizam para a bandeira.
- **Um aparelho:** antena, chip NFC e versão do Android influenciam detecção e tempos. Os resultados valem para o modelo usado.
- **Um operador:** posição e firmeza da aproximação variam pouco entre tentativas, mas não foram medidas. A marca na traseira reduz essa variação.
- **Cartões em circulação × especificação:** os testes automatizados usam respostas sintéticas. Divergências reais são registradas em `DECISIONS.md`.
- **Build release com diagnóstico ligado:** a condição dos ensaios difere do uso em produção (diagnóstico desligado). O efeito esperado nos tempos de etapa é desprezível.

## Divergências

Se um cartão falhar de forma sistemática (ex.: `PROTOCOL_ERROR` no GPO), fazer uma captura extra pelo **Diagnóstico**, exportar o texto (comandos já mascarados) e registrar o caso na tabela "Divergências spec EMV × cartão real" de [DECISIONS.md](../../DECISIONS.md). Não interromper a sessão: a tentativa conta como falha.

## Alterações do protocolo

| Data | Alteração | Motivo |
|---|---|---|
| — | — | — |
