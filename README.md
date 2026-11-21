# react-native-cashtap

SDK React Native que transforma um Android em leitor de cartão por aproximação (NFC/EMV).

> Em desenvolvimento. A documentação completa (instalação, captura, API, erros e limitações) é publicada ao final do projeto (T30).

## Plataforma

Somente Android com NFC. Fora do Android, `getNfcStatus()` resolve `'UNSUPPORTED'` (veja `DECISIONS.md`, D002 e D008).

## Uso disponível

```ts
import {
  getNfcStatus,
  onNfcStatusChange,
  openNfcSettings,
} from 'react-native-cashtap';

const status = await getNfcStatus(); // 'READY' | 'DISABLED' | 'UNSUPPORTED'
const unsubscribe = onNfcStatusChange((next) => console.log(next));
if (status === 'DISABLED') openNfcSettings();
```

## Contribuindo

- [Fluxo de desenvolvimento](CONTRIBUTING.md#development-workflow)
- [Código de conduta](CODE_OF_CONDUCT.md)

## Licença

MIT
