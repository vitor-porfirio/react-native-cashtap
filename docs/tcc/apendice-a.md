# Apêndice A — Interface pública do SDK

Interface tal como publicada em `src/index.ts` (versão final). Os identificadores estão em inglês por decisão de projeto (D006); a tabela de equivalência com a proposta original em português está ao final.

## A.1 Integração mínima

```tsx
import { CashTapProvider, capture } from 'react-native-cashtap';

// 1. Uma vez, na raiz do app
<CashTapProvider>
  <App />
</CashTapProvider>;

// 2. Onde a cobrança acontece
const result = await capture({ amountCents: 1050 });
if (result.status === 'success') enviarAoBackend(result.card);
```

O integrador não desenha telas nem conduz etapas: o `CashTapProvider` hospeda o modal do SDK, que acompanha o ciclo do início ao desfecho (inversão de controle, E6-H1).

## A.2 Funções

```ts
function capture(params: CaptureParams): Promise<CaptureResult>;
function cancel(): void;
function onStateChange(listener: (event: CaptureStateEvent) => void): Unsubscribe;

function getNfcStatus(): Promise<NfcStatus>;
function onNfcStatusChange(listener: (status: NfcStatus) => void): Unsubscribe;
function openNfcSettings(): void;

type NfcStatus = 'READY' | 'DISABLED' | 'UNSUPPORTED';
type Unsubscribe = () => void;
```

`capture()` resolve sempre com um desfecho; rejeita apenas por erro de integração (Provider ausente, módulo nativo não instalado).

## A.3 Parâmetros

```ts
type CaptureParams = {
  amountCents: number;        // inteiro > 0 (RN-03)
  currencyCode?: string;      // ISO 4217 numérico; padrão '986'
  reference?: string;         // devolvido em meta.reference
  timeoutMs?: number;         // padrão 30 000; faixa 10 000–120 000 (RN-05)
  maxRetries?: number;        // padrão 2; faixa 0–5 (RN-08)
  diagnostics?: boolean;      // painel de diagnóstico (E7-H3)
  appearance?: CashTapAppearance;
};
```

## A.4 Resultado

```ts
type CaptureResult =
  | { status: 'success'; card: CardData; meta: CaptureMeta }
  | { status: 'cancelled'; meta: CaptureMeta }
  | { status: 'timeout'; error: CashTapError; meta: CaptureMeta }
  | { status: 'error'; error: CashTapError; meta: CaptureMeta };

type CardData = {
  pan: string;                // único ponto em que o PAN completo aparece (RN-24)
  panMasked: string;          // 6 primeiros + 4 últimos
  expiry: string;             // AAMM
  brand: 'visa' | 'mastercard';  // inferida pelo AID (RN-20)
  aid: string;
  applicationLabel?: string;
  panSequenceNumber?: string;
};

type CaptureMeta = {
  captureId: string;
  reference?: string;
  startedAt: number;
  durationMs: number;
  attempts: number;
  detectionMs?: number;          // só em sucesso: do capture() à aproximação que deu certo (t_deteccao)
  readDurationMs?: number;       // só em sucesso: do início dessa leitura ao resultado (t_ciclo)
  stepTimings: { step: EmvStep; durationMs: number }[];
  cryptogramPresent?: boolean;   // o valor nunca é exposto (RN-27)
};

type EmvStep = 'SELECT_PPSE' | 'SELECT_AID' | 'GET_PROCESSING_OPTIONS' | 'READ_RECORD';

type CashTapError = {
  code: ErrorCode;
  message: string;            // pt-BR, para o operador
  detail?: string;            // técnico, sem dado do cartão
  recoverable: boolean;
};
```

## A.5 Estados observáveis

```ts
type CaptureState =
  | 'IDLE' | 'CHECKING' | 'WAITING_CARD' | 'READING' | 'RECOVERABLE_FAILURE'
  | 'PROCESSING' | 'SUCCESS' | 'CANCELLED' | 'TIMEOUT' | 'ERROR';

type CaptureStateEvent = {
  state: CaptureState;
  previous: CaptureState;
  captureId: string;
  attempts: number;
  error?: CashTapError;
  timestamp: number;
};
```

## A.6 Aparência

```ts
type CashTapAppearance = {
  mode?: 'dark' | 'light';
  colors?: Partial<CashTapColors>;
  fontFamily?: string;
  borderRadius?: number;
  texts?: Partial<CashTapTexts>;
  haptics?: boolean;
};
```

Aplicada no `CashTapProvider` (todas as capturas) ou em `capture({ appearance })` (só aquela). Altera a apresentação, nunca as transições (E6-H3).

## A.7 Instrumentação (ensaios) — `react-native-cashtap/dev`

```ts
// Painel
function CashTapDiagnostics(props: CashTapDiagnosticsProps): JSX.Element;
type CashTapDiagnosticsProps = {
  onEmptyAction?: () => void;   // ação do estado vazio (ex.: ir para a cobrança)
  emptyActionLabel?: string;
};

// Registro da última captura com diagnostics: true (em memória)
function getLastDiagnostics(): DiagnosticsReport | null;
function onDiagnosticsChange(listener: (report: DiagnosticsReport | null) => void): Unsubscribe;
function diagnosticsToText(report: DiagnosticsReport): string;

type DiagnosticsReport = {
  captureId: string;
  startedAt: number;
  transitions: Array<{ state: CaptureState; atMs: number }>;
  exchanges: DiagnosticsExchange[];
  outcome?: CaptureResult['status'];
  errorCode?: ErrorCode;
  stepTimings: StepTiming[];
  durationMs?: number;          // t_total
  readDurationMs?: number;      // t_ciclo
  cryptogramPresent?: boolean;
};
type DiagnosticsExchange = {
  step: EmvStep;
  command: string;              // hexadecimal; só dados do terminal
  response: string;             // mascarada na origem (allowlist, D016)
  sw: string;
  durationMs: number;
  atMs: number;
};

// Medições dos ensaios
function toMeasurementRow(result: CaptureResult): MeasurementRow;
function measurementsToCsv(
  rows: ReadonlyArray<MeasurementRow & Record<string, unknown>>,
  extraColumns?: readonly string[]   // colunas do app, à esquerda (ex.: 'sessao')
): string;
const MEASUREMENT_COLUMNS: ReadonlyArray<readonly [keyof MeasurementRow, string]>;

type MeasurementOutcome = 'success' | 'recovered' | 'failure' | 'cancelled' | 'timeout';
type MeasurementRow = {
  captureId: string;
  outcome: MeasurementOutcome;
  errorCode: ErrorCode | '';
  brand: CardBrand | '';
  attempts: number;
  detectionMs: number | null;   // t_deteccao
  readMs: number | null;        // t_ciclo
  totalMs: number;              // t_total
  ppseMs: number | null;        // t_ppse
  aidMs: number | null;         // t_aid
  gpoMs: number | null;         // t_gpo
  readRecordMs: number | null;  // t_read
};
```

`<CashTapDiagnostics />` exibe a última captura feita com `diagnostics: true`. `MEASUREMENT_COLUMNS` liga cada campo ao rótulo do formulário de ensaios do Apêndice B, que é o cabeçalho do CSV (`captura`, `desfecho`, `categoria`, `bandeira`, `tentativas`, `t_deteccao`, `t_ciclo`, `t_total`, `t_ppse`, `t_aid`, `t_gpo`, `t_read`); no CSV, o desfecho sai como `sucesso`, `recuperado`, `falha`, `cancelado` ou `expirado`. Essas funções ficam numa entrada separada para não entrarem no bundle de produção (D020).

## A.8 Equivalência com a proposta original

| Proposta (pt) | Interface final |
|---|---|
| `capturar(p: CapturaParams)` | `capture(params: CaptureParams)` |
| `cancelar()` | `cancel()` |
| `verificarDisponibilidade()` | `getNfcStatus()` |
| `aoMudarEstado(cb)` | `onStateChange(cb)` |
| — | `onNfcStatusChange(cb)`, `openNfcSettings()` (RN-02) |
| — | `<CashTapProvider>` (hospeda o modal) |
| `valorCentavos, moeda, referencia, timeoutMs, maxTentativas, aparencia` | `amountCents, currencyCode, reference, timeoutMs, maxRetries, appearance` |
| status `sucesso / cancelado / erro` | `success / cancelled / timeout / error` |
| `DadosCartao` | `CardData` |
| `MetaCaptura` | `CaptureMeta` (acrescidos `detectionMs`, `readDurationMs`, `stepTimings`, `cryptogramPresent`) |
| `ErroCashTap {codigo, mensagem, detalhe}` | `CashTapError {code, message, detail, recoverable}` |

`timeout` virou status próprio para que o integrador distinga "ninguém aproximou o cartão" de falha de leitura sem inspecionar o código de erro.
