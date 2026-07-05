# Rotas — /api/github

Fonte: `api/routes/github.js` — lógica em [modules/github.md](../modules/github.md); worktree em [modules/git.md](../modules/git.md).

`viewFilter` (items e column-counts): texto no formato da view do GitHub — `repo:owner/repo label:nome texto-livre` — decomposto server-side em `{ repoName, labels, text }`.

---

## GET /api/github/repos

Repositórios do usuário autenticado.

```json
[{ "name": "repo", "fullName": "user/repo", "private": false, "description": "...", "updatedAt": "...", "sshUrl": "...", "cloneUrl": "..." }]
```

Retorna `[]` se sem auth.

## GET /api/github/boards

GitHub Projects V2 (pessoais + organizações).

```json
[{ "id": "PVT_xxx", "title": "Nome", "number": 1, "url": "...", "org": null, "repos": [{ "name": "repo", "fullName": "user/repo", "cloneUrl": "..." }] }]
```

Erro de escopo: `500 { "error": "MISSING_SCOPE:read:project" }` — gh CLI sem `read:project`.

## GET /api/github/boards/:id/items

Itens do board (cache em memória). Sem `columnId`/`columnName` → todos; com coluna → filtra por status.

| Param | Descrição |
|-------|-----------|
| `first` | Itens por página (máx 500 — cache local, fatia barata; padrão 20) |
| `after` | Cursor de paginação |
| `columnId` | ID da opção de single-select (preferido) |
| `columnName` / `column` | Nome da coluna (fallback) |
| `viewFilter` | Ver acima |

```json
{
  "items": [{ "id": "PVTI_xxx", "type": "Issue", "itemType": null, "title": "...", "number": 42, "body": "markdown", "assignees": ["login"], "labels": [{ "name": "bug", "color": "d73a4a" }] }],
  "hasNextPage": true,
  "endCursor": "cursor"
}
```

## GET /api/github/boards/:id/column-counts

Contagem de itens por coluna (respeita `viewFilter`).

## GET /api/github/boards/:id/views

`[{ id, name, number }]`

## GET /api/github/boards/:id/columns

Opções do campo Status: `[{ id, name, color }]`

## GET /api/github/boards/:id/repos

Repos vinculados ao board.

## GET /api/github/repos/:owner/:repo/branches

Branches do repo; `?q=` filtra por texto.

## POST /api/github/repos/:owner/:repo/branches

**Body:** `{ newBranch, originBranch, cardNumber? }` (os dois primeiros obrigatórios — `400`).

Com `cardNumber` → `setupWorktree()` ([modules/git.md](../modules/git.md)): clona/reusa o repo, cria a branch e a worktree do card → `{ ok, worktreeDir, helpersDir, cloned }`. Sem `cardNumber` → só `{ ok: true }`.
