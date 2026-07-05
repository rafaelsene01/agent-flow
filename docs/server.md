# Servidor

Fonte: `api/server.js`

---

## `startServer({ port, apiOnly })`

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `port` | — | Porta de escuta (localhost) |
| `apiOnly` | `false` | Se `true`, não serve o frontend |

Retorna `{ app, server, url }`.

Lança erro se `web/out/` não existir e `apiOnly` for `false` — execute `npm run build` primeiro.

---

## Sequência de boot

1. `recoverInterruptedRuns()` — worktrees com `messageStatus`/`pullStatus` presos em `"running"` (servidor caiu no meio) viram `"error"`.
2. Registro das rotas: status, config, github, usage, usage-stats, skills, agents, agent-runs, board-chat, integrations.
3. `recoverAndDispatch()` — retoma a fila de agent-runs (ver [modules/agent-runs.md](modules/agent-runs.md)).
4. `startTelegramPolling()` — escuta respostas do usuário no Telegram.
5. Frontend estático (skip se `apiOnly`):
   - `express.static(web/out, { redirect: false })` — `redirect:false` evita `/agent` → `/agent/`.
   - `GET /board/:slug` → serve `board/_.html` (slug é runtime; cliente resolve pelo pathname).
   - Catch-all: tenta `<path>.html` (App Router exporta `<rota>.html`), fallback `index.html`.
6. Error handler final: sempre responde JSON `{ error }`, nunca texto.
7. Pós-listen: `warmup()` do status, `warmItemsCache()` por board e `startItemsPolling()` (revalida itens a cada 60s em background).

---

## Timeouts

Requisições de items com `viewFilter` podem varrer várias páginas do GitHub (>30s):

| Timeout | Valor |
|---------|-------|
| `requestTimeout` | 180s |
| `headersTimeout` | 185s (> requestTimeout) |
| `keepAliveTimeout` | 125s (> proxyTimeout do Next em dev, 120s) |
