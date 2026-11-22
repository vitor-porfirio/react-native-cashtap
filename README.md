# react-native-cashtap

SDK React Native que transforma um celular Android em leitor de cartão por aproximação (NFC/EMV). O app informa o valor da cobrança; o SDK apresenta a própria interface, conversa com o cartão e devolve os dados prontos para o seu backend.

```tsx
import { CashTapProvider, capture } from 'react-native-cashtap';

<CashTapProvider>
  <App />
</CashTapProvider>;

const result = await capture({ amountCents: 1050 });
if (result.status === 'success') enviarAoBackend(result.card);
```

- **Inversão de controle:** o app não desenha nenhuma tela do fluxo — modal, instruções, timeout, novas tentativas e mensagens de erro são do SDK.
- **Protocolo próprio:** diálogo EMV (PPSE → AID → GPO → READ RECORD) e parser BER-TLV implementados no pacote, sem biblioteca de terceiros.
- **Nova Arquitetura:** Turbo Module com Codegen.
- **Sem rede e sem persistência:** o SDK não faz nenhuma chamada de rede e não grava dado de cartão.

> **Leia as [limitações](#limitações)** antes de usar: o SDK lê dados públicos do cartão; ele **não autoriza pagamentos** e **não é certificado** (PCI MPoC / EMV L2-L3).

---

## Requisitos

| | |
|---|---|
| Plataforma | **Android** com NFC. Em iOS o pacote instala, mas `capture()` resolve com `NFC_UNSUPPORTED` sem abrir nada (veja limitações). |
| React Native | ≥ 0.88 (versão testada), Nova Arquitetura habilitada (`newArchEnabled=true`) |
| Android | `minSdk` 24 (Android 7.0) |
| Cartões | Visa e Mastercard contactless |

## Instalação

```sh
yarn add react-native-cashtap
# ou: npm install react-native-cashtap
```

Recompile o app Android (`yarn android` ou pelo Android Studio). O autolinking registra o módulo; recarregar só o JavaScript não basta. Em Expo, use um *development build* (o Expo Go não carrega módulos nativos de terceiros).

### Permissões

Nada a configurar. O manifesto do pacote declara e o Android funde no do seu app:

| Declaração | Por quê |
|---|---|
| `android.permission.NFC` | Ler o cartão. Permissão normal, concedida na instalação. |
| `android.permission.VIBRATE` | Retorno tátil do modal. Permissão normal. |
| `uses-feature android.hardware.nfc required="false"` | O app **não** é escondido na Play Store de quem não tem NFC; a ausência é tratada em tempo de execução (`NFC_UNSUPPORTED`). |

## Uso

### 1. Monte o Provider uma vez, perto da raiz

```tsx
import { CashTapProvider } from 'react-native-cashtap';

export default function Root() {
  return (
    <CashTapProvider>
      <App />
    </CashTapProvider>
  );
}
```

### 2. Cobre

```tsx
import { capture } from 'react-native-cashtap';

async function cobrar(amountCents: number) {
  const result = await capture({ amountCents });

  switch (result.status) {
    case 'success':
      // result.card.pan é o número completo: envie ao seu backend e descarte.
      // Para exibir e registrar, use result.card.panMasked.
      return api.autorizar({ ...result.card, amountCents });
    case 'cancelled':
      return; // o operador desistiu
    case 'timeout':
      return mostrarAviso(result.error.message); // ninguém aproximou o cartão
    case 'error':
      return mostrarAviso(result.error.message); // result.error.code para lógica
  }
}
```

`capture()` **sempre resolve** com um desfecho — nunca rejeita por erro de operação (cartão não aceito, NFC desligado, tempo esgotado...). Ela só rejeita por erro de **integração**: `CashTapProvider` não montado ou módulo nativo não instalado. `getNfcStatus()` e `onNfcStatusChange()` seguem a mesma regra: no Android sem o módulo nativo, lançam o erro de instalação.

### 3. (Opcional) Mostre o status do NFC no seu app

```tsx
import { getNfcStatus, onNfcStatusChange, openNfcSettings } from 'react-native-cashtap';

const status = await getNfcStatus(); // 'READY' | 'DISABLED' | 'UNSUPPORTED'
const unsubscribe = onNfcStatusChange(setStatus); // avisa quando o usuário liga/desliga
if (status === 'DISABLED') openNfcSettings();
```

O próprio modal já trata NFC desligado: orienta o operador, abre as configurações e reverifica sozinho quando o NFC é ligado.

## API

### `capture(params): Promise<CaptureResult>`

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `amountCents` | `number` | — | **Obrigatório.** Valor em centavos, inteiro, de 1 a 999 999 999 999 (limite do campo EMV de valor). |
| `currencyCode` | `string` | `'986'` | ISO 4217 numérico (BRL = `'986'`). |
| `reference` | `string` | — | Identificador da cobrança no seu app; volta em `meta.reference`. |
| `timeoutMs` | `number` | `30000` | Espera pela aproximação. Faixa 10 000–120 000 (fora dela, vale o limite mais próximo). |
| `maxRetries` | `number` | `2` | Novas tentativas automáticas em falha recuperável: cartão afastado cedo, falha de comunicação ou resposta ilegível. Faixa 0–5. |
| `appearance` | `CashTapAppearance` | — | Aparência só desta captura (sobrepõe a do Provider). |
| `diagnostics` | `boolean` | `false` | Registra **em memória** a última captura para o `<CashTapDiagnostics>`. Desenvolvimento. |

```ts
type CaptureResult =
  | { status: 'success'; card: CardData; meta: CaptureMeta }
  | { status: 'cancelled'; meta: CaptureMeta }
  | { status: 'timeout'; error: CashTapError; meta: CaptureMeta }
  | { status: 'error'; error: CashTapError; meta: CaptureMeta };

type CardData = {
  pan: string;          // número completo — entregue só aqui
  panMasked: string;    // 476173******0010
  expiry: string;       // AAMM
  brand: 'visa' | 'mastercard';
  aid: string;
  applicationLabel?: string;
  panSequenceNumber?: string;
};

type CaptureMeta = {
  captureId: string;
  reference?: string;
  startedAt: number;        // epoch ms
  durationMs: number;       // até o desfecho
  attempts: number;         // leituras, contando as retentativas
  // Só em sucesso:
  detectionMs?: number;     // do capture() à aproximação que deu certo
  readDurationMs?: number;  // do início dessa leitura ao resultado
  stepTimings: Array<{ step: EmvStep; durationMs: number }>; // vazio fora do sucesso
  cryptogramPresent?: boolean; // o valor do criptograma nunca é exposto
};
```

### Outras funções

| Função | Descrição |
|---|---|
| `cancel()` | Cancela a captura ativa. Imediato aguardando o cartão; durante a leitura, efetivado ao fim do comando em curso. |
| `onStateChange(listener)` | Notifica cada transição do ciclo (`CHECKING`, `WAITING_CARD`, `READING`, ...). Devolve a função que cancela a assinatura. |
| `getNfcStatus()` | `'READY' \| 'DISABLED' \| 'UNSUPPORTED'`. Fora do Android, sempre `'UNSUPPORTED'`. |
| `onNfcStatusChange(listener)` | Avisa quando o NFC é ligado ou desligado. |
| `openNfcSettings()` | Abre a tela de NFC do sistema. |

### Erros

`result.error` traz `code` (estável, para lógica), `message` (pt-BR, para o operador), `recoverable` e `detail` (técnico, sem dado do cartão).

| Código | Quando |
|---|---|
| `NFC_UNSUPPORTED` | Aparelho sem NFC, ou plataforma que não é Android. O modal não abre. |
| `NFC_DISABLED` | NFC desligado e o operador fechou a tela que pede para ligá-lo. |
| `INVALID_AMOUNT` | `amountCents` ou `currencyCode` inválido. O rádio não é acionado. |
| `ALREADY_RUNNING` | Já existe uma captura em andamento. |
| `UNSUPPORTED_BRAND` | Cartão não é Visa/Mastercard (ou não é de pagamento). |
| `INCOMPLETE_DATA` | O cartão não forneceu número ou validade. |
| `READ_FAILED_MAX_RETRIES` | O cartão foi afastado/falhou mais vezes que `maxRetries`. |
| `TIMEOUT` | Ninguém aproximou o cartão no tempo (status `timeout`). |
| `UNKNOWN` | Falha inesperada. Veja `detail`. |

`CARD_REMOVED`, `PROTOCOL_ERROR` e `PARSE_ERROR` são tratados internamente com novas tentativas e só aparecem em `onStateChange`. `CANCELLED_BY_USER` também não chega a `result.error`: cancelamento resolve com `status: 'cancelled'`.

> `ErrorCode` e `CardBrand` podem ganhar valores em versões minor. Em `switch`, mantenha um `default`.

## Personalização

```tsx
<CashTapProvider
  appearance={{
    mode: 'light',
    colors: { primary: '#0B7A55', error: '#B42318' },
    fontFamily: 'IBMPlexSans-Regular',
    borderRadius: 8,
    texts: { waitingTitle: 'Encoste o cartão aqui' },
    haptics: true,
  }}
>
```

- `mode`: `'dark'` (padrão) ou `'light'`.
- `colors`: qualquer cor de `CashTapColors`. Ao trocar só `primary`, `text`, `background`, `success` ou `error`, as variações (tons fortes e suaves, texto secundário, superfícies e bordas) são derivadas.
- `texts`: qualquer texto de `CashTapTexts` — títulos e dicas de cada estado, botões e os rótulos das etapas da leitura. Os não informados mantêm o padrão em pt-BR.
- `haptics`: `false` desliga a vibração do modal.
- Valores de tipo errado são ignorados (o modal usa o padrão), nunca derrubam a tela.
- A aparência muda **como** o fluxo parece, nunca **o que** acontece: timeout, retentativas e cancelamento não mudam.

## Diagnóstico e ensaios (desenvolvimento)

Ferramentas de desenvolvimento ficam numa entrada separada, fora do bundle de quem não as importa:

```tsx
import { CashTapDiagnostics, toMeasurementRow, measurementsToCsv } from 'react-native-cashtap/dev';

await capture({ amountCents: 100, diagnostics: true });
<CashTapDiagnostics />; // transições, tempo por etapa e comandos (dados sensíveis mascarados)

const row = toMeasurementRow(result); // { outcome, readMs, totalMs, ppseMs, ... }
const csv = measurementsToCsv(rows, ['sessao']); // colunas extras à esquerda; cabeçalho do Apêndice B
```

Requer bundler com suporte ao campo `exports` (Metro faz isso por padrão) e, para os tipos, `moduleResolution` `bundler` ou `node16` no `tsconfig` do app (padrão do template atual do React Native).

## Segurança e privacidade

- **Sem rede:** nenhuma chamada de rede no pacote. Transmitir os dados é responsabilidade do seu app.
- **Sem persistência:** nada do cartão é gravado. Os buffers de bytes da leitura são zerados ao fim; o número e a validade, porém, viram `String` (Kotlin) e `string` (JavaScript), que são imutáveis e só somem quando o coletor de lixo os recolhe. Não guarde `result.card` além do necessário para enviá-lo ao backend.
- **Logs:** nenhum log do SDK contém número completo, Track 1/2 ou criptograma. O diagnóstico usa lista de permissões de tags: tudo o que não é estrutura pública aparece mascarado.
- **PAN completo uma vez:** só em `result.card.pan`. Use `panMasked` para exibir e registrar.
- **Criptograma:** nunca exposto (apenas `meta.cryptogramPresent`).

## Limitações

Leia antes de usar em qualquer contexto real.

- **Somente Android.** No iOS nenhuma API pública dá ao app acesso aos comandos EMV de um cartão de pagamento: o Core NFC bloqueia as aplicações de pagamento e o Tap to Pay on iPhone entrega os dados cifrados ao provedor de pagamento, nunca ao app.
- **Não autoriza pagamentos.** O SDK lê dados públicos do cartão. A autorização depende do criptograma, que só o emissor valida, e de uma credenciadora. O resultado do SDK é a entrada para esse processo, não a confirmação de um pagamento.
- **Não é certificado.** Não há certificação PCI MPoC nem EMV L2/L3, e não há controles antifraude de produção (atestação do dispositivo, detecção de root, ofuscação). Não use para aceitar pagamentos reais sem esses controles.
- **Bandeiras:** Visa e Mastercard. Outras (Elo, Amex, Hipercard) resultam em `UNSUPPORTED_BRAND`.
- **Responsabilidade sobre o dado:** o número do cartão é dado pessoal (LGPD). Base legal, finalidade, transmissão segura e retenção dos dados recebidos são responsabilidade do app integrador. Receber, transmitir ou armazenar o número completo coloca o app e o backend no escopo do PCI DSS.
- **Carteiras digitais:** celular ou relógio com Google Pay/Apple Pay entregam um *token* (DPAN), não o número do cartão físico.
- **Validação em campo:** testado com fixtures sintéticos e roteiro em aparelho físico ([docs/validacao-device.md](docs/validacao-device.md)); o comportamento de cartões em circulação pode divergir da especificação.

## Desenvolvimento

```sh
yarn                                        # dependências
yarn typecheck && yarn lint && yarn test     # TypeScript
cd example/android && ./gradlew :react-native-cashtap:testDebugUnitTest   # Kotlin (JVM)
yarn example android --active-arch-only      # app de exemplo no celular
```

Documentação técnica em [`docs/`](docs/):

- [Arquitetura](docs/arquitetura.md) — camadas, contrato da ponte, threading, testes
- [Codegen](docs/codegen.md) e [anatomia Android](docs/anatomia-android.md)
- [Validação no aparelho](docs/validacao-device.md) e [protocolo dos ensaios](docs/ensaios/protocolo.md)
- [Apêndice A](docs/tcc/apendice-a.md) (interface pública) e [Apêndice C](docs/tcc/apendice-c.md) (comandos APDU)

Decisões de projeto em [`DECISIONS.md`](DECISIONS.md). Fluxo de contribuição em [CONTRIBUTING.md](CONTRIBUTING.md#development-workflow) e [código de conduta](CODE_OF_CONDUCT.md).

## Licença

MIT
