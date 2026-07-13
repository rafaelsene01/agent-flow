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
| `claude.kill.js` | `killTree(child)` — mata o `claude` e toda a descendência (grupo de processos) |

---

## claude.runner.js

- `runClaude(prompt, cwd, logStream, sessionId, onSpawn, opts)` — roda o CLI com `{ model, effort }`; `sessionId` nomeia a sessão (permite resume depois). Retorna `{ code, ... }`.
- `resumeClaude(...)` — mesma assinatura; retoma sessão existente (mesmo session id).
- `createRunLog(wt, name, { append, initialContent })` — stream de log persistido no helpers dir; expõe `persistPath`.
- `registerSseClient(id, res)` / `unregisterSseClient` / `broadcastDone(id)` — clientes SSE por id (worktree ou run) recebem o log em tempo real.
- `failureDetail(result, persistPath)` — mensagem de erro amigável a partir do resultado + log.

## claude.concurrency.js

- `getMaxConcurrent()` — teto ÚNICO de processos `claude` simultâneos, compartilhado pela fila de runs (`agent-runs.queue`) e pelo chat de worktree (`routes/config/runner`). Um número em `maxConcurrentRuns` sobrepõe; `null`/ausente cai no cálculo adaptativo ao host: `min(⌊núcleos/2⌋, ⌊RAM_GB/4⌋)`, mínimo 1.
- `acquireSlot()` / `releaseSlot()` — admissão que **lança** `status: 429` quando cheio (usada pelo chat, que recusa em vez de enfileirar).
- `reserveSlot()` — reserva sem lançar (usada pelo dispatcher da fila, que já checou `getActiveCount()` contra `getMaxConcurrent()` antes de despachar).
- `getActiveCount()` — total de processos `claude` vivos (runs + chats); é o valor que ambos os caminhos consultam contra o teto.
- `registerProcess(id, child)` / `unregisterProcess(id)` — processos ativos por id.
- `cancelProcess(id)` — mata o processo registrado (cancelamento de run/chat) via `killTree`.
- `getActiveCount()`

## claude.kill.js

- `killTree(child)` — derruba o `claude` e **toda a descendência** (tools, bash, MCP servers), evitando netos órfãos. No Unix os processos são spawnados com `detached: true` (líder de grupo) e o kill usa `process.kill(-pid)` no grupo, com SIGKILL de fallback após ~5s; no Windows usa `taskkill /T /F`. Usado no timeout do runner e no `cancelProcess`.

## claude.service.js — `getStatus()`

```js
{ connected: true,  method: "claude-cli", version: "1.x.x" }
{ connected: false }
```
