# Módulo — GitHub

Fonte: `api/modules/github/`

Responsável por detectar autenticação GitHub e fazer chamadas à REST API.

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `github.client.js` | HTTP client bruto — chamadas à API GitHub |
| `github.service.js` | Lógica de detecção de auth — exporta `getStatus()` |

---

## github.client.js

Todas requisições usam `Bearer` token e header `X-GitHub-Api-Version: 2022-11-28`.

### `validateToken(token)`

`GET /user` — valida token. Retorna objeto do usuário ou lança erro em 401/403.

```js
const user = await validateToken("ghp_xxx");
// { login: "joseComilão01", name: "Comilão", ... }
```

### `getRepositories(token)`

`GET /user/repos?per_page=100&sort=updated` — lista repositórios ordenados por última atualização.

**Formato de erro:** `"GitHub API error <status>: <body>"`

---

## github.service.js

### `getStatus()`

Detecta autenticação GitHub em ordem de prioridade:

1. **Token de ambiente** — `GH_TOKEN` | `GITHUB_TOKEN` | `GITHUB_KEY` → valida via `validateToken()`
2. **gh CLI** — `gh api user` → parse JSON para login
3. **SSH** — `ssh -T git@github.com` → busca `Hi <usuário>!` em stdout+stderr
4. **git ls-remote** — fallback SSH via stack git (mais confiável no Windows)

Cada etapa passa adiante em caso de falha.

**Retorno:**
```js
{ connected: true,  method: "env"|"gh-cli"|"ssh", user: "login", name: "Nome" }
{ connected: false }
```
