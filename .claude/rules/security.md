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
- **Tags sensíveis** nunca saem em claro de `emv/` exceto no resultado final: `5A` (PAN), `57` (Track 2), `56` (Track 1), `9F6B` (Track 2 MC), `5F20` (nome), `9F1F` (Track 1 discricionário), `9F26` (criptograma), `9F10` (IAD). APDUs de diagnóstico substituem o valor dessas tags por `*`.
- O PAN completo aparece **uma única vez**, no objeto de resultado de sucesso, sempre acompanhado de `panMasked`.
- Buffers com dado sensível (`ByteArray`, `CharArray`) são sobrescritos com zero após montar o resultado — RN-26, "na medida em que a plataforma permitir" (strings JVM/JS são imutáveis: documentar a limitação).
- Erros carregam `detail` técnico **sem** dado sensível.

## Verificação

- Teste unitário que passa uma resposta com PAN de teste pelo log/diagnóstico e afirma que o PAN completo não aparece.
- QA faz grep dos PANs de teste fora de `android/src/test` e `src/**/__tests__`.
- QA faz grep de APIs de rede em `src/` e `android/src/main`.
