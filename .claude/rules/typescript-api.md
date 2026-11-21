# Camada TypeScript e API pública

## Design da API

- **Idioma:** identificadores em inglês (`capture`, `CaptureParams`, `status: 'success'`). Mensagens ao operador em pt-BR, centralizadas em `src/errors.ts` e nos textos padrão do tema.
- **Superfície mínima:** `capture`, `cancel`, `getNfcStatus`, `onStateChange`, `CashTapProvider` e os tipos. Tudo o mais é interno. Cada `export` em `src/index.ts` é uma promessa pública.
- **Resultado discriminado:** `capture()` **nunca rejeita** por erro esperado. Resolve com `{ status: 'success' | 'cancelled' | 'timeout' | 'error', ... }`. Rejeição só para bug de programação (ex.: Provider ausente).
- **Uniões de string, não `enum`.** Listas de valores definidas como `as const` e tipos derivados delas.
- **Valores monetários em centavos inteiros** em toda a stack; formatação só na UI (especificação §12.3).
- **Parâmetros validados na entrada** (RN-03); fora da faixa → clamp documentado (RN-05, RN-08).

## Fronteira nativa

- `src/NativeCashtap.ts` é privada. Só `src/native.ts` importa dela.
- Todo valor vindo do nativo é validado em runtime (type guard). JSON é parseado e validado campo a campo; formato inválido vira erro `PARSE_ERROR`, nunca `as`.
- O acesso ao módulo usa `TurboModuleRegistry.get` + checagem de `Platform.OS === 'android'`.

## Estilo

- `strict` do TS sem exceções; sem `any` (usar `unknown` + guard).
- Funções puras no `core/`; efeitos isolados no runner e na UI.
- Componentes funcionais com hooks; sem estado global fora do runner.
- Nomes de testes referenciam a regra: `it('RN-08: encerra após maxRetries', ...)`.
