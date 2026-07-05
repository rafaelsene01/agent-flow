# Módulo — Claude

Fonte: `api/modules/claude/`

Runner do Claude CLI: spawn de processos, logs com SSE e controle de concorrência. Usado por agent-runs, chat de worktree (`routes/config/runner.js`), board-chat e criadores de skill/agent.

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `claude.service.js` | `getStatus()` — detecção via `claude --version` (CLI é o único método) |
| `claude.runner.js` | Spawn/resume do CLI, log persistido + broadcast SSE |
| `claude.concurrency.js` | Slots de execução simultânea + registro/cancelamento de processos |

---

## claude.runner.js

- `runClaude(prompt, cwd, logStream, sessionId, onSpawn, opts)` — roda o CLI com `{ model, effort }`; `sessionId` nomeia a sessão (permite resume depois). Retorna `{ code, ... }`.
- `resumeClaude(...)` — mesma assinatura; retoma sessão existente (mesmo session id).
- `createRunLog(wt, name, { append, initialContent })` — stream de log persistido no helpers dir; expõe `persistPath`.
- `registerSseClient(id, res)` / `unregisterSseClient` / `broadcastDone(id)` — clientes SSE por id (worktree ou run) recebem o log em tempo real.
- `failureDetail(result, persistPath)` — mensagem de erro amigável a partir do resultado + log.

## claude.concurrency.js

- `acquireSlot()` / `releaseSlot()` — limite de execuções simultâneas (config `maxConcurrentRuns`, default 3). `acquireSlot` lança erro com `status` quando cheio.
- `registerProcess(id, child)` / `unregisterProcess(id)` — processos ativos por id.
- `cancelProcess(id)` — mata o processo registrado (cancelamento de run/chat).
- `getActiveCount()`

## claude.service.js — `getStatus()`

```js
{ connected: true,  method: "claude-cli", version: "1.x.x" }
{ connected: false }
```
