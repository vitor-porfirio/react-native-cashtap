# Dados brutos dos ensaios

CSVs exportados pela tela **Ensaios** do app de exemplo, um por sessão, sem edição manual. Protocolo em [../protocolo.md](../protocolo.md).

- `sessao-<n>-<AAAA-MM-DD>-<bandeira>.csv`: exportação feita ao fim de cada bloco de uma sessão (botão **Exportar sessão N**). Pode repetir tentativas do bloco anterior; o script conta cada captura uma vez.
- `descartes.csv`: tentativas descartadas por erro de procedimento (`captura,motivo`), uma por linha. Ver "Descartes" no protocolo.

| Sessão | Data | Ordem | Aparelho / Android | Bateria | Commit do app | Cartões (bandeira, tipo) | Descartes |
|---|---|---|---|---|---|---|---|
| 1 | | Visa → Mastercard | | | | | |
| 2 | | Mastercard → Visa | | | | | |
| 3 | | Visa → Mastercard | | | | | |
