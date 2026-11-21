# CashTap — app de exemplo

App hospedeiro que consome o `react-native-cashtap` pelo código-fonte do repositório (D001). Só Android.

Na raiz do repositório:

```sh
yarn                                   # instala dependências
yarn example start                     # Metro
yarn example android --active-arch-only   # compila e instala no celular conectado
```

Mudanças em TS aparecem com reload do Metro. Mudanças na spec (`src/NativeCashtap.ts`) ou em Kotlin exigem recompilar (veja `docs/codegen.md`).

Roteiro de validação no celular: [`docs/validacao-device.md`](../docs/validacao-device.md).
