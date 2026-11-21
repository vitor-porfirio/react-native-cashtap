# Camada nativa (Kotlin)

## Threading

- Nenhum I/O na main thread. `IsoDep.transceive` roda num executor dedicado de thread única (`Executors.newSingleThreadExecutor`), criado pelo módulo e encerrado no `invalidate()`.
- `enableReaderMode` / `disableReaderMode` rodam na UI thread (`UiThreadUtil.runOnUiThread`).
- O callback `onTagDiscovered` já vem numa thread de binder: não fazer trabalho pesado nele, só guardar a `Tag` e emitir o evento.
- Estado compartilhado entre threads: `@Volatile` ou `AtomicReference`/`AtomicBoolean`. Nada de `var` mutável lido de duas threads sem isso.

## Ciclo de vida

- A Activity é obtida com `reactApplicationContext.currentActivity` **no momento do uso**. Nunca guardar referência forte a uma Activity.
- `NfcSessionManager` implementa `LifecycleEventListener`: desliga o reader mode em `onHostPause` e religa em `onHostResume` se a sessão ainda estiver ativa (E2-H2).
- `invalidate()` do módulo: desliga reader mode, fecha IsoDep, encerra o executor, remove o listener.

## Recursos

- Todo `IsoDep.connect()` tem `close()` num `finally` (RN-11).
- `isoDep.timeout` é configurado de forma explícita.
- `TagLostException` e `IOException` durante transceive viram `CARD_REMOVED` (recuperável). Nunca escapam como exceção não tratada para o JS.

## Promises

- Toda `Promise` é resolvida **ou** rejeitada exatamente uma vez, em todos os caminhos.
- Rejeição sempre com código do catálogo (`promise.reject("CARD_REMOVED", "...")`) e mensagem técnica sem dado sensível.

## Estilo

- Kotlin idiomático: `val` por padrão, `data class` para DTOs, `sealed class`/`enum` para resultados fechados.
- Sem `!!` sobre dado vindo do cartão ou do sistema.
- `ByteArray` é tratado sem sinal com `and 0xFF` ao converter para `Int`.
- Núcleo `emv/` sem imports `android.*`. Log via interface `Logger` injetada (implementação Android usa `android.util.Log` com tag `CashTap`).
- Nada de `println`. Nada de `Log` direto fora do `Logger`.
