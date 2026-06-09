# Rotas — /api/github

Fonte: `api/routes/github.js`

---

## GET /api/github/repos

Lista repositórios do usuário autenticado.

**Resposta:**
```json
[{ "name": "repo", "fullName": "user/repo", "private": false, "description": "...", "updatedAt": "...", "sshUrl": "...", "cloneUrl": "..." }]
```

Retorna `[]` se sem auth. Erro: `500 { "error": "mensagem" }`

---

## GET /api/github/boards

Lista GitHub Projects V2 (pessoais + organizações).

**Resposta:**
```json
[{ "id": "PVT_xxx", "title": "Nome", "number": 1, "url": "...", "org": null, "repos": [{ "name": "repo", "fullName": "user/repo", "cloneUrl": "..." }] }]
```

`org` é `null` para projetos pessoais.

Erro de escopo: `500 { "error": "MISSING_SCOPE:read:project" }` — gh CLI sem permissão `read:project`.

---

## GET /api/github/boards/:id/items

Busca itens do projeto. Sem `columnId`/`columnName` → retorna todos. Com coluna → filtra por status.

**Query params:**

| Param | Descrição |
|-------|-----------|
| `first` | Itens por página (max 100, padrão 20) |
| `after` | Cursor de paginação |
| `columnId` | ID da opção de single-select (preferido) |
| `columnName` | Nome da coluna (fallback) |
| `viewFilter` | Texto com filtros: `repo:owner/repo label:nome` |

**Resposta:**
```json
{
  "items": [{
    "id": "PVTI_xxx",
    "type": "Issue",
    "itemType": null,
    "title": "Título",
    "number": 42,
    "body": "# Markdown\nDescrição...",
    "assignees": ["login"],
    "labels": [{ "name": "bug", "color": "d73a4a" }]
  }],
  "hasNextPage": true,
  "endCursor": "cursor"
}
```

`itemType` — valor do campo "Type"/"Issue Type" do projeto (single-select). `null` se não existir.

---

## GET /api/github/boards/:id/views

Lista views do projeto.

**Resposta:**
```json
[{ "id": "...", "name": "Board view", "number": 1 }]
```

---

## GET /api/github/boards/:id/columns

Lista colunas (opções do campo Status) do projeto.

**Resposta:**
```json
[{ "id": "...", "name": "In Progress", "color": "BLUE" }]
```
