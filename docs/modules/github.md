# Módulo — GitHub

Fonte: `api/modules/github/`

---

## Arquivos

| Arquivo | Exporta |
|---------|---------|
| `github.client.js` | `validateToken`, `getRepositories`, `graphQL`, `getToken` |
| `github.service.js` | `getStatus()` |
| `github.repos.js` | `listRepos()` |
| `github.boards.js` | `listBoards()`, `listViews()`, `listColumns()` |
| `github.items.js` | `listItems()`, `listAllItems()`, `listItemsByColumn()` |

---

## github.client.js

Todas as requisições usam `Bearer` token e `X-GitHub-Api-Version: 2022-11-28`.

- `validateToken(token)` — `GET /user`, valida token
- `getRepositories(token)` — `GET /user/repos?per_page=100&sort=updated`
- `graphQL(query, token, variables)` — `POST /graphql`, retorna resposta bruta
- `getToken()` — lê `GH_TOKEN` | `GITHUB_TOKEN` | `GITHUB_KEY` do env

---

## github.service.js

### `getStatus()`

Detecta auth em ordem:
1. Token de ambiente → `validateToken()`
2. `gh api user` via CLI (tokens removidos do env antes de chamar)

Salva `githubMethod` (`"env"` | `"gh-cli"`) em config.

```js
{ connected: true,  method: "env"|"gh-cli", user: "login", name: "Nome" }
{ connected: false, error: "mensagem" }
```

---

## github.repos.js

### `listRepos()`

Tenta em ordem: token de ambiente → `getRepositories()`, depois `gh repo list`. Retorna `[]` se ambos falharem.

```js
[{ name, fullName, private, description, updatedAt, sshUrl, cloneUrl }]
```

---

## github.boards.js

### `listBoards()`

Lista Projects V2 (pessoais + orgs). Método via `config.githubMethod` — `"env"` usa token, `"gh-cli"` usa CLI. Busca até 50 por pessoa/org (máx 30 orgs).

Lança `"MISSING_SCOPE:read:project"` se gh CLI não tiver permissão `read:project`.

```js
[{ id, title, number, url, org, repos: [{ name, fullName, cloneUrl }] }]
```

### `listViews(projectId)` / `listColumns(projectId)`

```js
// views
[{ id, name, number }]

// columns — opções do campo Status
[{ id, name, color }]
```

---

## github.items.js

### `listAllItems(projectId, opts)`

Busca todas as páginas (até 10 / 1000 itens), filtra por `repoName` e `labels`. Retorna itens com coluna (`columnName`, `columnId`).

### `listItemsByColumn(projectId, { columnId, columnName }, opts)`

Paginação eficiente por coluna. Cursor composto `"<githubCursor>|<skip>"` evita re-buscar do início ao paginar.

**Item retornado:**
```js
{ id, type, itemType, title, number, body, assignees, labels }
```

- `type` — `"Issue"` | `"PullRequest"` | `"DraftIssue"`
- `itemType` — valor do campo "Type"/"Issue Type" (single-select). `null` se não existir.
- `body` — markdown da descrição. `null` se vazio.
