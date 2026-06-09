# Servidor

Fonte: `api/server.js`

---

## `startServer({ port, apiOnly })`

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `port` | — | Porta de escuta |
| `apiOnly` | `false` | Se `true`, não serve o frontend |

Retorna `{ app, server, url }`.

Lança erro se `web/out/` não existir e `apiOnly` for `false` — execute `npm run build:web` primeiro.

---

## Ordem de registro

1. `statusRoutes(app)` — `/api/status`
2. `configRoutes(app)` — `/api/config`, `/api/config/browse`
3. `githubRoutes(app)` — `/api/github/repos`, `/api/github/boards`, `/api/github/boards/:id/*`
4. `express.static(web/out)` — frontend buildado (skip se `apiOnly`)
5. Catch-all → `index.html` (SPA fallback, skip se `apiOnly`)
