# Segurança e dados de cartão

Implementa RN-22 a RN-27 e a seção 2.3 do TCC.

## Proibido

- Persistir qualquer dado lido do cartão (disco, AsyncStorage, SharedPreferences, cache, arquivo de log) — RN-22.
- Logar, em qualquer nível (inclusive debug), PAN completo, Track 2, Track 1, nome do portador ou criptograma — RN-23.
- Fazer qualquer chamada de rede no pacote — RN-25. Nenhum `fetch`, `XMLHttpRequest`, `WebSocket`, `HttpURLConnection` ou `OkHttp` em `src/` ou `android/`.
- Expor o criptograma (9F26) na API pública — RN-27. Diagnóstico pode informar apenas "presente: sim/não".
- Usar PAN real em fixture, teste, doc ou commit. Só PANs de teste públicos (`4761739001010010`, `5413330089010434`, `4111111111111111`, `5555555555554444`).

## Obrigatório

- **Mascaramento na origem:** o dado é mascarado no ponto em que é produzido para log/evento/diagnóstico, não no ponto de escrita. Formato `123456******7890` (6 primeiros + 4 últimos) — RN-24.
- **Allowlist no diagnóstico** (D016): só tags primitivas listadas em `EmvTags.DIAGNOSTIC_CLEAR` aparecem em claro; todo o resto (inclusive tags desconhecidas) vira `**`. Nunca trocar por denylist. Tags sabidamente sensíveis (`EmvTags.SENSITIVE`: 5A, 57, 56, 9F6B, 5F20, 9F1F, 9F26, 9F10, 9F46, 9F47, 9F48, 9F4B, 9F24) jamais entram na allowlist — há teste garantindo.
- Mensagens de erro de parsing citam só offsets, nunca bytes lidos do cartão.
- `data class` com PAN sobrescreve `toString()` com a versão mascarada.
- O PAN completo aparece **uma única vez**, no objeto de resultado de sucesso, sempre acompanhado de `panMasked`.
- Buffers com dado sensível (`ByteArray`, `CharArray`) são sobrescritos com zero após montar o resultado — RN-26, "na medida em que a plataforma permitir" (strings JVM/JS são imutáveis: documentar a limitação).
- Erros carregam `detail` técnico **sem** dado sensível.

## Verificação

- Teste unitário que passa uma resposta com PAN de teste pelo log/diagnóstico e afirma que o PAN completo não aparece.
- QA faz grep dos PANs de teste fora de `android/src/test` e `src/**/__tests__`.
- QA faz grep de APIs de rede em `src/` e `android/src/main`.
