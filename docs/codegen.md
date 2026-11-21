# Codegen e Turbo Module

Como a spec TypeScript vira código nativo neste projeto (T04).

## Configuração

`package.json`:

```json
"codegenConfig": {
  "name": "CashtapSpec",
  "type": "modules",
  "jsSrcsDir": "src",
  "android": { "javaPackageName": "com.cashtap" }
}
```

O Codegen varre `src/` atrás de arquivos `Native*.ts` que exportam uma `interface Spec extends TurboModule`. Neste pacote o único é [src/NativeCashtap.ts](../src/NativeCashtap.ts).

## O que é gerado

O Codegen roda como parte do build do Gradle (tarefa `generateCodegenArtifactsFromSchema`, disparada pelo `preBuild`). O *Sync* do Android Studio não basta: é preciso um build. A saída fica em `android/build/generated/source/codegen/`:

| Arquivo | Papel |
|---|---|
| `schema.json` | A spec traduzida para uma estrutura neutra (nome do módulo, métodos, tipos). |
| `java/com/cashtap/NativeCashtapSpec.java` | Classe abstrata que o `CashtapModule.kt` estende. Cada método da spec vira `public abstract`; cada `EventEmitter` vira um `protected final void emitOnX(...)`. |
| `jni/CashtapSpec-generated.cpp` | Cola C++: tabela `methodMap_` que liga o nome chamado pelo JS (via JSI) ao método Java (via JNI), com a assinatura JNI de cada um. |
| `jni/CashtapSpec.h`, `jni/CMakeLists.txt` | Cabeçalho e build da cola C++. |

Exemplo real deste pacote:

```java
public abstract class NativeCashtapSpec extends ReactContextBaseJavaModule implements TurboModule {
  public static final String NAME = "Cashtap";
  protected final void emitOnNfcStatusChange(String value) { ... }
  public abstract void getNfcStatus(Promise promise);
  public abstract void openNfcSettings();
}
```

## Mapeamento de tipos usado

| Spec TS | Kotlin |
|---|---|
| `Promise<string>` | parâmetro `promise: Promise`, resolvido com `promise.resolve(String)` |
| `void` | `Unit` (chamada assíncrona, sem retorno) |
| `number` | `Double` |
| `boolean` | `Boolean` |
| `CodegenTypes.EventEmitter<string>` | `emitOnX(value: String)` gerado na classe base |

Estruturas complexas (o resultado da leitura do cartão) atravessam como JSON `string` e são validadas no TS ([src/native.ts](../src/native.ts)), conforme a especificação §2.4.

## Garantia de contrato

1. A spec TS é a fonte da verdade.
2. O build regenera `NativeCashtapSpec`.
3. Se o `CashtapModule.kt` não implementar exatamente as assinaturas abstratas, **o Kotlin não compila**.
4. Em execução, o valor que volta do nativo ainda passa por type guard no TS — o tipo é a expectativa, a validação é a verificação.

## Spec alterada sem rebuild do nativo

O Metro recarrega só o JavaScript. A tabela `methodMap_` (C++) e a classe `NativeCashtapSpec` (Java) estão **compiladas dentro do APK**. Se a spec muda e o app não é recompilado, o JS novo conversa com o binário antigo:

| Mudança na spec | Sintoma com o APK antigo |
|---|---|
| Método novo | O host object não tem o método: `TypeError: module.novoMetodo is not a function`. |
| Método removido | O JS deixa de chamar; o nativo antigo continua lá, sem efeito visível. |
| Aridade ou tipo alterado | O C++ antigo converte os argumentos pela assinatura JNI velha: erro de conversão ou crash em tempo de execução, não erro de compilação. |
| Novo `EventEmitter` | `module.onX is not a function` ao assinar. |
| Módulo inteiro ausente (pacote recém-instalado, autolinking falhou) | `TurboModuleRegistry.get` devolve `null`. No Android, `src/native.ts` transforma isso em erro explícito de instalação (`LINKING_ERROR`, D010), para não ser confundido com "aparelho sem NFC". |

**Regra prática:** mudou `src/NativeCashtap.ts` ou qualquer `.kt` → rebuild nativo (`yarn example android`). Reload do Metro só serve para mudanças em TS/TSX que não tocam a spec.

## Caminho de uma chamada

```
src/api.ts → src/native.ts → NativeCashtap (JSI host object)
  → CashtapSpec-generated.cpp (methodMap_) → JNI
  → CashtapModule.getNfcStatus(promise) → promise.resolve("READY")
  → a Promise JS é resolvida → validação em src/native.ts
```

O módulo é *lazy*: o `CashtapModule` só é instanciado no primeiro acesso a partir do JS (`needsEagerInit = false` no `CashtapPackage`).
