# Git e documentação

## Git

- Branch por fase: `fase/f1-fundacao`, `fase/f2-radio`, ...
- Conventional commits (o `commitlint` do lefthook valida). Referenciar a issue: `feat(emv): add BER-TLV parser (#12)`.
- Commits pequenos e coesos; um commit não mistura refatoração e feature.
- PR por fase com: issues cobertas, checklist de DoD, pareceres do QA e do TL, o que ficou para validar no device.
- Nunca `--no-verify`. Se o hook falhar, corrigir a causa.
- Rodapé de atribuição conforme configuração da sessão.

## Documentação (pt-BR)

- `README.md` — integração sem ler o código: instalação, permissões, uso, API, erros, limitações (seção obrigatória: só Android, sem autorização financeira, sem certificação PCI/EMV, responsabilidade do integrador sobre o dado).
- `docs/` — arquitetura, API, Codegen, validação no device, material do TCC (apêndices).
- `DECISIONS.md` — formato D00N (Contexto, Decisão, Alternativas, Consequências, Evidência). Divergências spec × cartão real na tabela do final.
- Comentários no código: só o porquê não óbvio (regra RN-xx, armadilha de protocolo). Sem comentários narrando o óbvio.
