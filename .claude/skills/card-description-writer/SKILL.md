---
name: card-description-writer
description: "Gera descrições de card (Jira/Linear/markdown) para demandas de FEATURE/ENDPOINT DE API, seguindo o padrão de documentação técnica do usuário via fluxo de perguntas sequencial (Objetivo, Permissão, Endpoint, Query Params, Headers, Request, Response). Use sempre que o usuário pedir para 'criar/escrever a descrição de um card', 'documentar esse endpoint', 'fazer a descrição da demanda/feature'. Funciona em dois modos: dados completos fornecidos (apenas formata) ou descrição vaga (faz as perguntas do fluxo, uma de cada vez, antes de escrever). NÃO use para bugfix, chore, refactor — apenas features que introduzem ou alteram endpoints de API."
---

# Card Description Writer (Feature/Endpoint de API)

Gera descrições de card no padrão usado pelo usuário para demandas de **feature que envolve endpoint de API**. Não cobre bugfix/chore — se o usuário pedir isso, avise que a skill ainda não suporta esses tipos e ofereça fazer no formato geral mesmo assim, deixando claro que não é o padrão testado.

## Antes de escrever: identifique o modo

**Modo A — Dados completos fornecidos**
O usuário já passou endpoint, método HTTP, payloads de request/response, headers etc. Nesse caso: **apenas formate** no template abaixo. Não invente, não "melhore", não adicione campos que o usuário não mencionou. Fidelidade ao que foi dado é prioridade sobre completude do template.

**Modo B — Descrição vaga**
O usuário descreveu a demanda em linguagem natural, sem contrato técnico completo. Nesse caso, siga o **fluxo de perguntas** abaixo, na ordem, **uma pergunta (ou bloco de pergunta) por vez** — não dispare as 9 de uma vez em uma lista. Se o usuário já respondeu algo no meio da descrição inicial (ex: já deu o endpoint), não pergunte de novo sobre esse ponto — pule pro próximo.

Se a mensagem misturar os dois (parte dada, parte vaga), trate campo por campo: o que foi dito = formatado sem pergunta; o que não foi dito = entra no fluxo.

## Fluxo de perguntas (Modo B)

Siga esta ordem. Cada item abaixo é uma parada — só avance depois de ter a resposta (ou confirmação explícita de "pode assumir um padrão").

1. **Objetivo** — qual é a ação e o recurso? (ex: "listar contratos de um cliente")
2. **Permissão — key** — nome do recurso de permissão (ex: `client_contract`)
3. **Permissão — valor/ação** — qual ação dentro da permissão (ex: `ver`, `criar`, `editar`, `deletar`)
4. **Endpoint** — método HTTP + caminho. Se o usuário não souber a convenção de URL, procure um exemplo já confirmado nesta conversa ou em cards anteriores do usuário antes de sugerir — nunca invente uma convenção nova sem precedente.
5. **Query Parameters** — só pergunte se for listagem (GET de lista). Listagem **sempre tem `offset` e `limit`** (não pergunte isso, já é padrão fixo) — pergunte apenas se há *outros* parâmetros além desses (filtros, `search`, `sort`, `order`, etc.).
6. **Headers** — pergunte se há headers além dos dois padrão. `Authorization` e `x-api-key` **sempre aparecem** com a descrição fixa do template — não pergunte sobre eles, apenas inclua.
7. **Request (body)** — só pergunte se houver body (POST/PUT/PATCH). Peça um exemplo de payload. Ao escrever o card, tipe corretamente cada campo do exemplo (string, number, boolean, etc.) mesmo que o usuário tenha mandado só os valores.
8. **Descrição de cada campo** — para cada campo do request e/ou response, peça uma breve descrição. Você pode sugerir uma descrição plausível como ponto de partida (ex: `_id: UUID` → sugerir "Identificador único do registro"), mas o usuário confirma ou corrige — não decida sozinho sem mostrar a sugestão.
9. **Response** —
   - Primeiro pergunte: é uma **lista** ou um **objeto único**?
   - Se for lista: o shape padrão é `{ items: [...], total: number }` (offset/limit como paginação). Não pergunte sobre isso — é o padrão fixo. Pergunte apenas se há *outros* campos além de `items`/`total` no nível raiz da resposta.
   - Se for objeto único: peça o exemplo de retorno do zero, sem assumir shape.

## Pergunta opcional — armadilhas e lógica de campo

Depois do fluxo principal, faça **uma pergunta opcional**, algo como:

> "Tem algum campo com lógica de transformação não-óbvia, regra de filtro específica, ou armadilha que vale documentar (ex: um campo que parece um valor mas é calculado, um filtro que exclui certos registros)?"

- Se o usuário responder algo: adicione ao final do card uma seção `## Observações` com o conteúdo, em formato de checklist (`- [ ] descrição da armadilha`).
- Se o usuário não tiver nada a acrescentar (ou pular a pergunta): **não inclua a seção** — ela é totalmente condicional, nunca aparece vazia ou como placeholder.

## Origem de campo (Sistema vs Extração) — condicional

**Só pergunte/inclua isso se o usuário mencionar espontaneamente que os dados vêm de fontes diferentes** (ex: parte do sistema, parte de uma extração/LLM/processo externo). Não pergunte isso por padrão em todo card — a maioria dos endpoints não tem essa mistura.

Se o usuário mencionar mistura de fontes, adicione uma seção extra antes do "Detalhamento dos campos de resposta":

```markdown
## Origem de cada campo
| Campo | Origem | Fonte |
|---|---|---|
| <campo> | Sistema / Extração | <de onde vem exatamente> |
```

## Template

Use exatamente esta estrutura e ordem de seções. Não adicione seções extras (ex: "Critérios de Aceite", "Escopo", "Requisitos Técnicos") a menos que o usuário peça explicitamente — não é o padrão dele.

```markdown
## Objetivo
<frase curta e técnica, ex: "Desenvolver um endpoint para [ação] [recurso]">

---

## Contexto
### Permissão necessária
\`\`\`
{
  "<recurso>": ["<ação>"]
}
\`\`\`

### Contrato API
#### Endpoint
\`\`\`
<MÉTODO> - URL_BASE/<versão>/<caminho>
\`\`\`

#### Query Parameters
<Se for listagem: sempre incluir offset e limit como linhas fixas, mais quaisquer outros parâmetros confirmados>
| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| offset | Não | Índice inicial dos resultados. Default: 0 |
| limit | Não | Quantidade de itens por página. Default: 20, Max: 100 |

#### Request (body)
<Omitir esta subseção e a próxima inteiramente se o método não tiver body (GET sem body)>
\`\`\`json
<exemplo de payload, tipado corretamente>
\`\`\`

#### Body Parameters (request)
| Parâmetro | Obrigatório | Descrição |
|---|---|---|
<uma linha por campo do body>

#### Response (body)
\`\`\`json
<Se lista: {"items": [...], "total": N}. Se objeto único: shape confirmado com o usuário>
\`\`\`

#### Detalhamento dos campos de resposta
| Campo | Tipo | Descrição |
|---|---|---|
<uma linha por campo>

#### Header Parameters
| Parâmetro | Obrigatório | Descrição |
|:---|:---|:---|
| Authorization | Sim | JWT obtido no endpoint responsável pelo login |
| x-api-key | Não | Token obtido através de solicitação via suporte. Caso esta chave seja enviada, o `Authorization` não é mais obrigatório |
```

## Regras de formatação

1. **Tabelas vazias nunca duplicam o cabeçalho.** Cabeçalho + separador, uma vez só. Nunca repita a linha `|---|---|---|` duas vezes.

2. **Exemplos de valores gerados pela própria skill devem ser realistas e únicos**, nunca o mesmo valor concatenado três vezes ou placeholders visivelmente quebrados. Para UUID de exemplo, gerar um único UUID v4 plausível. **Em Modo A, nunca altere um valor que o usuário forneceu**, mesmo que pareça malformado ou repetido — se parecer um possível erro de copy-paste do usuário, sinalize a suspeita em texto fora do card e pergunte se quer manter ou corrigir.

3. **Headers padrão (`Authorization`, `x-api-key`)** seguem sempre a mesma descrição do template, a menos que o usuário diga que esse endpoint tem regra de auth diferente.

4. **Query Parameters sempre aparece em listagens**, com `offset`/`limit` fixos, mesmo que não haja outros parâmetros.

5. **Tipagem no Request/Response.** Ao transcrever um exemplo de payload dado pelo usuário em linguagem informal (ex: "tem nome, idade e se é ativo"), gere o JSON com tipos reais (`"nome": "string"` → valor de exemplo string, `idade` → number, `ativo` → boolean), nunca deixe placeholders de tipo como texto solto.

## Quando o usuário pedir bugfix/chore

Diga algo como: "Essa skill hoje só cobre cards de feature/endpoint de API — bugfix e chore ainda não têm um template definido. Posso tentar adaptar a estrutura mesmo assim, mas sem garantia de que vai ficar no formato que você normalmente usa. Quer que eu tente, ou prefere me passar um exemplo de como você documenta esses tipos pra eu fazer certo?"
