# Anatomia do projeto Android

Mapa dos arquivos nativos do CashTap e de como eles se ligam. Produzido na T02.

## Dois projetos Android, papéis diferentes

| Pasta | O que é | Plugin Gradle | Artefato |
|---|---|---|---|
| `example/android/` | app hospedeiro | `com.android.application` | APK — instalável, assinado, com `applicationId` e Activity de entrada |
| `android/` | a biblioteca (o SDK) | `com.android.library` | AAR — `classes.jar` + manifesto + recursos; só existe dentro de um app |

Bibliotecas React Native não publicam AAR: o pacote npm leva o **código-fonte** de `android/` (campo `files` do `package.json`) e o Gradle do integrador compila esse código no build do app. Por isso a lib herda as versões do hospedeiro (`getExtOrDefault` em `android/build.gradle`).

## Gradle

| Arquivo | Papel |
|---|---|
| `example/android/settings.gradle` | Quais módulos participam do build. `autolinkLibrariesFromCommand()` inclui as libs RN automaticamente. |
| `example/android/build.gradle` | Versões globais: `minSdk 24`, `compileSdk 37`, `targetSdk 36`, Kotlin, NDK. |
| `example/android/app/build.gradle` | Identidade do app (`applicationId`, `namespace`), assinatura, dependências (`react-android`, Hermes). `autolinkLibrariesWithApp()` liga as libs ao `:app`. |
| `example/android/gradle.properties` | Chaves de build: `newArchEnabled`, `hermesEnabled`, `reactNativeArchitectures`. |
| `android/build.gradle` | Build da lib. Usa as versões do hospedeiro quando existem; senão, as próprias. `namespace "com.cashtap"`. |

### Identificadores e versões

- **`applicationId`** — identidade única do app no aparelho e na loja. Só o app tem.
- **`namespace`** — pacote Kotlin/Java onde o build gera `R` e `BuildConfig` e base para nomes relativos no manifesto (`.MainActivity`). App **e** lib têm (`cashtap.example` e `com.cashtap`). Não existe no JS.
- **`compileSdk`** — quais APIs do Android o compilador conhece. Vale só no build.
- **`minSdk`** — Android mais antigo que instala o app. O valor final é o maior entre o do app e o de cada lib (o manifest merger falha se o app declarar menos que uma lib exige).
- **`targetSdk`** — a quais mudanças de comportamento da plataforma o app se submete (ex.: a partir do 31, Activity com `intent-filter` precisa declarar `android:exported`).
- **ABIs** (`reactNativeArchitectures`) — processadores para os quais o C++ do RN é compilado. Em desenvolvimento, `yarn example android --active-arch-only` compila só a do aparelho conectado.

As APIs do Android moram no sistema operacional do aparelho, não no APK: o que pode ser chamado em execução depende da versão instalada no celular. APIs acima do `minSdk` exigem checagem de `Build.VERSION.SDK_INT`. As de NFC usadas aqui (`IsoDep` API 10, `enableReaderMode` API 19) estão abaixo do piso.

## AndroidManifest

`example/android/app/src/main/AndroidManifest.xml` é o contrato do app com o sistema, lido antes de qualquer código:

- `INTERNET` — em debug, o bundle JS é baixado do Metro (porta 8081). Em release o bundle vai dentro do APK.
- `<application android:name=".MainApplication">` — classe instanciada quando o processo nasce.
- `<activity android:name=".MainActivity">` com `MAIN` + `LAUNCHER` — ícone no launcher e tela de entrada.
- `configChanges` — impede que rotação e afins destruam e recriem a Activity.
- `launchMode="singleTask"` — no máximo uma instância da Activity.

`android/src/main/AndroidManifest.xml` (lib) é fundido no do app pelo **manifest merger do Android Gradle Plugin**, para qualquer dependência Android. É ali que a lib declara o que precisa (permissão `NFC`, `uses-feature`) sem o integrador editar nada. O app tem a palavra final (`tools:node="remove"`). O resultado fica em `example/android/app/build/intermediates/merged_manifest/`.

## Ordem de boot

```
Launcher dispara Intent MAIN/LAUNCHER
└─ sistema cria o processo
   └─ MainApplication.onCreate()  → loadReactNative(): libs nativas do RN
      └─ MainActivity.onCreate()  → cria o ReactHost (lazy)
         └─ PackageList(this).packages → registra MainReactPackage e CashtapPackage
            └─ Hermes carrega o bundle (Metro em debug / APK em release)
               └─ example/index.js → AppRegistry.registerComponent("CashtapExample")
                  └─ Fabric renderiza o componente getMainComponentName() = "CashtapExample"
```

- `index.js` é a entrada do **bundle JS**, não do app. Falhas antes dele só aparecem no `adb logcat`.
- O app RN inteiro vive numa única Activity; a navegação JS troca views dentro dela.

## Activity

Componente de tela do Android, criado e destruído pelo sistema (nunca por `new`), dono de uma janela, empilhado num back stack e usado como `Context` para APIs que precisam de uma tela.

```
onCreate → onStart → onResume  (primeiro plano)  → onPause → onStop → onDestroy
```

O `AppState` do RN é esse ciclo visto do JS (`onResume` ≈ `'active'`, `onStop` ≈ `'background'`). Módulos nativos recebem o mesmo ciclo por `LifecycleEventListener` (`onHostResume` / `onHostPause` / `onHostDestroy`).

Consequência para o SDK: `enableReaderMode` recebe uma Activity e só funciona com a que está em primeiro plano. O SDK obtém a Activity atual no momento do uso (`reactContext.currentActivity`) e não guarda referência fixa — a Activity pode não ser a `MainActivity` e pode ser destruída e recriada; segurar a antiga entrega o NFC à tela errada e vaza memória.

## Autolinking

Substitui as três edições manuais que cada lib exigia antes do RN 0.60 (`include` no `settings.gradle`, `implementation project(...)` no `app/build.gradle`, `new XPackage()` no `MainApplication`):

1. `settings.gradle` roda o CLI do RN (`config`), que varre as dependências com pasta `android/`.
2. `example/react-native.config.js` aponta `react-native-cashtap` para `..` — a lib entra pelo código-fonte (D001).
3. O resultado vai para `example/android/build/generated/autolinking/autolinking.json` (`sourceDir`, `packageImportPath`, `packageInstance`, `libraryName`).
4. O Gradle inclui `:react-native-cashtap` e gera `PackageList.java` com `new com.cashtap.CashtapPackage()`.

Para inspecionar: `cd example && npx react-native config`.

No JS, o equivalente é o workspace Yarn (`"workspaces": ["example"]`) mais a condição `react-native-cashtap-source` no `exports` do `package.json`, que faz o Metro ler `src/index.tsx` direto.

## Lado da lib

| Arquivo | Papel |
|---|---|
| `src/NativeCashtap.ts` | Spec tipada do módulo; `TurboModuleRegistry.getEnforcing<Spec>('Cashtap')`. |
| `android/.../CashtapPackage.kt` | Fábrica: cria o `CashtapModule` quando o RN pede `"Cashtap"`. `isTurboModule = true`, `needsEagerInit = false` (lazy). |
| `android/.../CashtapModule.kt` | Implementação; estende `NativeCashtapSpec`, gerada pelo Codegen (T04). |

## Pontes por nome

| Nome | Liga | Registro |
|---|---|---|
| `"CashtapExample"` | `MainActivity.getMainComponentName()` ↔ `app.json` / `AppRegistry` | componentes de tela |
| `"Cashtap"` | `getEnforcing('Cashtap')` ↔ `NativeCashtapSpec.NAME` ↔ `CashtapPackage` | módulos nativos |

Os dois registros são independentes. Nome divergente no primeiro: `"X" has not been registered`. No segundo: `getEnforcing` lança erro ao carregar o módulo.
