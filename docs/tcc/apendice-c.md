# Apêndice C — Sequência de comandos APDU implementada

Comandos tal como montados em `android/src/main/java/com/cashtap/emv/Apdu.kt` (`Commands`) e encadeados por `EmvOrchestrator.kt`. Bytes em hexadecimal.

## Etapa 1 — SELECT PPSE

```
CLA INS P1 P2 Lc  Data                                  Le
00  A4  04 00 0E  32 50 41 59 2E 53 59 53 2E 44 44 46 30 31  00     ("2PAY.SYS.DDF01")
```

| SW | Tratamento |
|---|---|
| 9000 | Extrai as entradas `61` do FCI (6F → A5 → BF0C → 61 → 4F/50/87). |
| 6A82 | Fallback (RN-15): SELECT AID direto com A0000000031010, A0000000032010, A0000000041010, A0000000043060. |
| outro | `PROTOCOL_ERROR`. |

## Etapa 2 — SELECT AID

```
00  A4  04 00 07  <AID, ex.: A0 00 00 00 03 10 10>  00
```

Candidatas: AIDs com RID A000000003 (Visa) ou A000000004 (Mastercard), ordenadas pela tag 87. Do FCI extrai-se o rótulo (50) e o PDOL (9F38). SW ≠ 9000 → tenta a próxima candidata; nenhuma → `UNSUPPORTED_BRAND`.

## Etapa 3 — GET PROCESSING OPTIONS

```
80  A8  00 00 Lc  83 <len> <dados do PDOL>  00
80  A8  00 00 02  83 00                     00     (sem PDOL)
```

Exemplo com o PDOL `9F66 04 9F02 06 9F03 06 9F1A 02 95 05 5F2A 02 9A 03 9C 01 9F37 04` (33 bytes de dados): `80 A8 00 00 23 83 21 36004000 000000001000 000000000000 0076 0000000000 0986 <AAMMDD> 00 <UN> 00`.

| Resposta | Tratamento |
|---|---|
| `80` (formato 1) | AIP = 2 primeiros bytes; AFL = restante. |
| `77` (formato 2) | AIP (82), AFL (94) e, em qVSDC, Track 2 (57) e criptograma (9F26). |
| SW ≠ 9000 | `PROTOCOL_ERROR`. |

## Etapa 4 — READ RECORD

```
00  B2  <registro> <(SFI << 3) | 4>  00
```

Um comando por par (SFI, registro) indicado no AFL (grupos de 4 bytes). Registro com SW ≠ 9000 é ignorado (E3-H5); a ausência de PAN/validade ao final gera `INCOMPLETE_DATA`.

## Tratamentos ISO 7816-4 comuns a todas as etapas

- `6Cxx`: reenvio com `Le = xx`.
- `61xx`: `GET RESPONSE` (`00 C0 00 00 xx`) até obter `9000`.
- Resposta com menos de 2 bytes: `PROTOCOL_ERROR` (RN-14).

## Comportamento observado nos cartões ensaiados

[Preencher após os ensaios: SW de cada etapa por bandeira, presença de PDOL, formato do GPO, registros lidos e divergências — ver tabela no `DECISIONS.md`.]
