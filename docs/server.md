# Servidor

Fonte: `api/server.js`

Monta o app Express, registra rotas e serve o build estático do web.

---

## `startServer({ port })`

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `port` | `number` | Porta de escuta (padrão `5522`) |

Retorna `{ app, server, url }`.

Lança erro se `web/out/` não existir — execute `npm run build:web` primeiro.

---

## Ordem de registro das rotas

1. `statusRoutes(app)` — `/api/status`
2. `express.static(web/out)` — serve o frontend buildado
3. Catch-all → `index.html` (fallback SPA)
