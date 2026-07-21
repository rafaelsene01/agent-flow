# Módulo — Agent Runs

Fonte: `api/modules/agent-runs/`

Fila e execução de runs de agentes. Persistência: SQLite nativo (`node:sqlite`) em `~/.agent-flow/agent-runs.db`, tabela `agent_runs`.

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `agent-runs.db.js` | `getDb()` — abre/cria o banco e a tabela |
| `agent-runs.store.js` | CRUD de runs, chains, breakpoints, turns |
| `agent-runs.queue.js` | Dispatcher: decide o que roda quando |
| `agent-runs.runner.js` | `startRun(run)` — executa um run via Claude CLI na worktree |

---

## Modelo

Run: `{ id, session_id, session_index, kind: 'agent'|'breakpoint', agent_id, status, turns, resume, resume_message, pending_question, last_error, log_file, helpers_dir, ... }`. Chain liga runs em pipeline; cada passo só roda quando o anterior termina `done`. `turns` é o histórico (exec/question/answer) em JSON.

**Sessões compartilhadas por card.** `session_index` numera as sessões do Claude por card (1-based; badge `S<n>` na UI). Runs com o mesmo index compartilham o `session_id`: o primeiro cria a sessão; os seguintes RETOMAM (resume com prompt completo do agente como mensagem — herdam contexto, economizam re-exploração). Serialização por worktree garante que dois runs nunca usem a sessão ao mesmo tempo. Breakpoints e runs sem card: `session_index` nulo. Runs antigos (pré-migração): nulo, badge não aparece.

## agent-runs.queue.js

- `enqueue(fields)` / `enqueueChain({ steps, ...common })` — cria run(s) `queued` e chama `tick()`.
- `tick()` — despacha respeitando: **um run por agente** e **um run por worktree** (`nextQueuedForFreeAgents(busyAgentIds, busyWorktreeKeys)`), além dos slots globais do módulo claude.
- `approveBreakpoint(id)` — aprova ponto de parada e destrava o próximo passo.
- `onRunSettled(...)` — callback de fim de run; re-tick.
- `recoverAndDispatch()` — no boot: `healOrphanDependencies()` (conserta chains com dependência órfã) + `resetProcessingToQueued()` (runs órfãos de restart) e re-despacha.

## agent-runs.store.js (principais)

- `createRun`, `getRun`, `getChain`, `listRuns`, `listRunsForCard`, `patchRun`, `deleteRun`, `clearRuns`
- `nextSessionIndexForCard(repo, cardNumber)` / `sessionsByIndexForCard(repo, cardNumber)` / `sessionHasStartedRun(sessionId, excludeRunId)` — sessões compartilhadas: próximo index livre, mapa index→session_id (resolução na rota de chain) e detecção "sessão já iniciada por outro run" (runner decide resume vs create)
- `runsAttentionSummary()` — resumo waiting/active por card (badge no board)
- `appendTurn(id, turn)` / `updateLastExecTurn(id, patch)`
- `promoteReadyBreakpoints()` / `approveBreakpoint(id)` / `failDependents(runId, reason)` — passo falhou → dependentes da chain falham juntos
- `deleteRun(id)` — antes de apagar, re-vincula os dependentes ao antecessor do removido (`depends_on` do próprio), preservando a cadeia (remover o passo 3 de 1→2→3→4 faz o 4 depender do 2). A rota `DELETE` chama `tick()` em seguida.
- `healOrphanDependencies()` — rede de segurança no boot (`recoverAndDispatch`): re-vincula runs cujo `depends_on` aponta para um run inexistente (chains órfãs de deletes antigos), reconstruindo o link pela ordem da chain (`created_at`). Sem isso, os passos seguintes ficariam presos na fila para sempre.
- `worktreeKey(repo, targetBranch)` / `worktreesOccupied()` / `runsProcessingByAgent()`

## agent-runs.runner.js

`startRun(run, { onSettled })` — monta o prompt do agente (via `buildAgentPrompt`), roda/resume o Claude CLI na worktree do card, grava log no helpers dir, registra turns e uso ([usage.md](usage.md)), e notifica eventos no Telegram ([integrations.md](integrations.md)).

Primeira execução com sessão compartilhada (`sessionHasStartedRun` → true): `resumeClaude` com o prompt completo do agente como mensagem, em vez de `runClaude`. Fallback `resumeNotFound` (histórico do CLI apagado) → recria com `runClaude` sob o mesmo `session_id`, igual ao resume normal.
