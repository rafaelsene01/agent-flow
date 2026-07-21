# Módulo — GitHub

Fonte: `api/modules/github/`

---

## Arquivos

| Arquivo | Exporta |
|---------|---------|
| `github.client.js` | `getToken`, `clearTokenCache`, `validateToken`, `getRepositories`, `graphQL` |
| `github.service.js` | `getStatus()` |
| `github.repos.js` | `listRepos()` |
| `github.boards.js` | `listBoards()`, `listViews()`, `listColumns()`, `listBoardRepos()` |
| `github.branches.js` | `listBranches()`, `createBranch()` |
| `github.items.js` | `listItems()`, `listAllItems()`, `listItemsByColumn()`, `listColumnCounts()`, cache: `warmItemsCache()`, `startItemsPolling()`, `stopItemsPolling()`, `clearItemsCache()` |

---

## github.client.js

Requisições com `Bearer` token e `X-GitHub-Api-Version: 2022-11-28`.

- `getToken()` — lê `GH_TOKEN` | `GITHUB_TOKEN` | `GITHUB_KEY` do env
- `validateToken(token)` — `GET /user`
- `getRepositories(token)` — `GET /user/repos?per_page=100&sort=updated`
- `graphQL(query, token, variables)` — `POST /graphql`, resposta bruta
- `githubApiError(prefix, status, text)` — monta o erro das respostas não-ok. 5xx (GitHub fora do ar, body é a página "Unicorn" em HTML) → mensagem amigável "GitHub está fora do ar… não foi possível validar", `err.status = 503`, sem despejar o HTML na UI. Demais status: `prefix status: body`. Usado também por `github.branches.js`.

## github.service.js — `getStatus()`

Detecta auth em ordem: token de ambiente → `gh api user` via CLI (tokens removidos do env antes). Salva `githubMethod` (`"env"` | `"gh-cli"`) na config.

```js
{ connected: true,  method: "env"|"gh-cli", user: "login", name: "Nome" }
{ connected: false, error: "mensagem" }
```

## github.repos.js — `listRepos()`

Token de ambiente → `getRepositories()`, senão `gh repo list`. `[]` se ambos falharem.

## github.boards.js

- `listBoards()` — Projects V2 (pessoais + orgs, até 50 por dono, máx 30 orgs). Método via `config.githubMethod`. Lança `"MISSING_SCOPE:read:project"` se o gh CLI não tiver a permissão.
- `listViews(projectId)` → `[{ id, name, number }]`
- `listColumns(projectId)` → opções do campo Status `[{ id, name, color }]`
- `listBoardRepos(projectId)` → repos vinculados ao board

## github.branches.js

- `listBranches(owner, repo, query)` — branches, filtro por texto
- `createBranch(owner, repo, newBranch, originBranch)`

## github.items.js

Cache de itens em memória por board:

- `warmItemsCache(projectId)` — pré-aquece no boot
- `startItemsPolling(getBoardIds)` — revalida todos os boards a cada 60s em background (lê a lista a cada tick para pegar boards novos)
- `listAllItems(projectId, opts)` — todas as páginas, filtra `repoName`/`labels`/`text`; itens com `columnName`/`columnId`
- `listItemsByColumn(projectId, { columnId, columnName }, opts)` — paginação por coluna; cursor composto `"<githubCursor>|<skip>"` evita re-buscar do início
- `listColumnCounts(projectId, opts)` — contagem por coluna com os mesmos filtros

**Item:** `{ id, type, itemType, title, number, body, assignees, labels }` — `type`: `"Issue"` | `"PullRequest"` | `"DraftIssue"`; `itemType`: valor do campo "Type"/"Issue Type" (`null` se não existir); `body`: markdown (`null` se vazio).
