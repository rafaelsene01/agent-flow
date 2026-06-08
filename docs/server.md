# Servidor

Fonte: `api/server.js`

Monta o app Express, registra rotas e serve o build estático do web.

---

## `startServer({ port, apiOnly })`

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `port` | `number` | — | Porta de escuta |
| `apiOnly` | `boolean` | `false` | Se `true`, não serve o frontend (skip do `web/out`) |

Retorna `{ app, server, url }`.

Lança erro se `web/out/` não existir e `apiOnly` for `false` — execute `npm run build:web` primeiro.

---

## Ordem de registro das rotas

1. `statusRoutes(app)` — `/api/status`
2. `configRoutes(app)` — `/api/config`, `/api/config/browse`
3. `githubRoutes(app)` — `/api/github/repos`, `/api/github/boards`
4. `express.static(web/out)` — serve o frontend buildado (skip se `apiOnly`)
5. Catch-all → `index.html` (fallback SPA, skip se `apiOnly`)
