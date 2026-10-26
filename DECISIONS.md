# Diário de decisões — CashTap

<!--
Modelo de entrada:

## DNNN — <título curto>  (AAAA-MM-DD · TNN)
**Contexto:** o problema ou a restrição
**Decisão:** o que foi escolhido
**Alternativas:** o que foi descartado e por quê
**Consequências:** o que isso facilita e o que custa
**Evidência:** bytes, logs, links (quando houver)
-->

## D001 — Repositório único: biblioteca + app de exemplo  (2026-10-26 · T01)

**Contexto:** o projeto começou com um app de testes avulso (`CashTapPlayground`, RN 0.87) usado para validar o ambiente. O entregável do TCC, porém, é uma biblioteca (`react-native-cashtap`) consumida por apps de terceiros, e a banca precisa ver a biblioteca e uma integração funcionando, com o histórico de desenvolvimento das duas.

**Decisão:** um único repositório, gerado pelo `create-react-native-library` (Turbo Module, RN 0.88, Nova Arquitetura), contendo a biblioteca na raiz e o app hospedeiro em `example/`. O `example/` é o app demonstrado na defesa e a entrega da T27. O `CashTapPlayground` é descartado e não é versionado.

**Alternativas:**
- *Biblioteca dentro do Playground* — descartada: mistura o código do SDK com o de um app específico e induz acoplamento da lib ao hospedeiro; repositório git aninhado complica o versionamento.
- *Dois repositórios (lib + app)* — descartada: divide o histórico e o `DECISIONS.md`, exige publicar ou linkar o pacote a cada mudança e dobra o custo de manutenção sem benefício para o TCC.

**Consequências:**
- Código, histórico, issues e decisões ficam num só lugar; a banca enxerga tudo junto.
- O `example/` consome a lib pelo código-fonte (workspace), com rebuild imediato a cada mudança.
- Custo: o `example/` não exercita o pacote como um integrador real o recebe (o que entra no `files` do `package.json`, build em `lib/`, autolinking a partir do `node_modules`). Uma instalação do pacote empacotado (`npm pack`) num app externo fica registrada como validação futura, depois da T27.
- Regra derivada: a lib nunca depende de nada do `example/`. A dependência só vai no sentido example → lib.

**Evidência:** estrutura gerada pelo `create-react-native-library` (commit `c898a27`); app de exemplo executado em dispositivo Android físico com NFC.

---

## D002 — Escopo restrito a Android; iOS fora do projeto  (2026-10-26 · T01)

**Contexto:** o SDK precisa conduzir o diálogo EMV completo com o cartão (SELECT PPSE → SELECT AID → GPO → READ RECORD) e devolver ao app dados do cartão (`pan`, `validade`, `bandeira`, `aid`). Isso exige que o código do app envie e receba APDUs arbitrárias para o chip do cartão.

**Decisão:** o SDK é implementado e suportado apenas em Android. O lado iOS gerado pelo template fica sem implementação e é declarado como não suportado na documentação.

**Alternativas:**
- *Core NFC (`NFCTagReaderSession` + `NFCISO7816Tag`)* — descartada. O Core NFC permite falar ISO 7816 apenas com aplicações cujos AIDs estejam declarados no `Info.plist` (`com.apple.developer.nfc.readersession.iso7816.select-identifiers`), e a Apple não libera a leitura de cartões de pagamento por esse caminho: AIDs de pagamento (Visa `A000000003…`, Mastercard `A000000004…`, PPSE `2PAY.SYS.DDF01`) são bloqueados para apps de terceiros. A API existe, mas não alcança o cartão que nos interessa.
- *Tap to Pay on iPhone (framework ProximityReader)* — descartada. É o único caminho oficial para aceitar cartões por aproximação no iPhone, mas exige entitlement concedido pela Apple e integração com um PSP parceiro habilitado. A leitura é feita pelo próprio sistema, com o componente seguro do aparelho, e os dados do cartão saem cifrados diretamente para o PSP: o app nunca vê PAN, validade nem as APDUs. Isso é incompatível com o objetivo do TCC (implementar o diálogo EMV e o parser) e com o contrato de saída do SDK.
- *APIs de NFC/Secure Element para pagamentos (iOS 17.4+ / 18.1+)* — não se aplicam: servem para o iPhone *emular* um cartão (o celular paga), não para *ler* um cartão (o celular cobra), além de exigirem acordo comercial com a Apple e estarem restritas a algumas regiões.

**Consequências:**
- No Android, `NfcAdapter.enableReaderMode` + `IsoDep.transceive` dão acesso direto a APDUs com qualquer cartão ISO-DEP, sem autorização prévia da plataforma. É isso que viabiliza o projeto.
- O público-alvo do SDK fica limitado a aparelhos Android com NFC.
- O limite é da plataforma, não técnico: com acesso equivalente ao do Android, o núcleo (bytes, APDU, TLV, EMV) seria reaproveitável.
- O tema volta no README (T30) e no capítulo de limitações do TCC.

**Evidência:** documentação Apple — Core NFC (`developer.apple.com/documentation/corenfc`) e ProximityReader / Tap to Pay on iPhone (`developer.apple.com/tap-to-pay/`). *Pendente:* anexar o trecho exato da documentação/guideline sobre o bloqueio de AIDs de pagamento no Core NFC.

---

# Divergências spec EMV × cartão real

| Data | Cartão | Esperado pela spec | Observado | Hex |
|---|---|---|---|---|
