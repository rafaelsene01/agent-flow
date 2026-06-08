# Módulo — GitHub

Fonte: `api/modules/github/`

Responsável por auth GitHub, listagem de repos e boards (Projects V2).

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `github.client.js` | HTTP client bruto — REST + GraphQL |
| `github.service.js` | Detecção de auth — exporta `getStatus()` |
| `github.repos.js` | Lista repositórios — exporta `listRepos()` |
| `github.boards.js` | Lista GitHub Projects V2 — exporta `listBoards()` |

---

## github.client.js

Todas requisições usam `Bearer` token e header `X-GitHub-Api-Version: 2022-11-28`.

### `validateToken(token)`

`GET /user` — valida token. Retorna objeto do usuário ou lança erro em 401/403.

### `getRepositories(token)`

`GET /user/repos?per_page=100&sort=updated` — lista repos ordenados por última atualização.

### `graphQL(query, token)`

`POST /graphql` — executa query GraphQL autenticada. Retorna resposta bruta.

**Formato de erro:** `"GitHub API error <status>: <body>"` / `"GitHub GraphQL error <status>: <body>"`

---

## github.service.js

### `getStatus()`

Detecta auth GitHub em ordem de prioridade:

1. **Token de ambiente** — `GH_TOKEN` | `GITHUB_TOKEN` | `GITHUB_KEY` → valida via `validateToken()`
2. **gh CLI** — `gh api user` → parse JSON para login (tokens de ambiente removidos do env antes de chamar)

Salva `githubMethod` (`"env"` | `"gh-cli"`) em config via `setConfig()` quando conectado.

**Retorno:**
```js
{ connected: true,  method: "env"|"gh-cli", user: "login", name: "Nome" }
{ connected: false, error: "mensagem" }
```

---

## github.repos.js

### `listRepos()`

Lista repos do usuário autenticado. Tenta em ordem:

1. Token de ambiente → `getRepositories()` (REST API)
2. `gh repo list` (gh CLI)

Retorna `[]` se ambos falharem.

**Formato de retorno:**
```js
[{ name, fullName, private, description, updatedAt, sshUrl, cloneUrl }]
```

---

## github.boards.js

### `listBoards()`

Lista GitHub Projects V2 (pessoais + organizações). Usa GraphQL.

Decisão de método baseada em `config.githubMethod`:
- `"env"` → `graphQL()` com token de ambiente
- `"gh-cli"` → `gh api graphql` via CLI (sem tokens de ambiente no env)
- Não definido → tenta token de ambiente, fallback para gh CLI

Busca até 50 projetos pessoais e 50 por organização (máx 30 orgs).

**Erro de escopo faltando:** lança `"MISSING_SCOPE:read:project"` quando gh CLI retorna `required scopes` ou `read:project`.

**Formato de retorno:**
```js
[{ id, title, number, url, org, repos: [{ name, fullName, cloneUrl }] }]
```

`org` é `null` para projetos pessoais.
