# Rotas — /api/agent-runs

Fonte: `api/routes/agent-runs.js` — fila/execução em [modules/agent-runs.md](../modules/agent-runs.md).

Run = execução de um agent sobre um card. Estados: `queued` → `processing` → `done` | `error` | `waiting` (pergunta pendente ou breakpoint).

---

## POST /api/agent-runs

Enfileira um run avulso. **Body:** `{ agentId, repo, cardNumber?, title?, body?, originBranch, targetBranch, model?, effort? }` — `agentId`, `repo`, `originBranch`, `targetBranch` obrigatórios. `model`/`effort` do body sobrepõem os do agente (intencional — ver AGENTS.md).

## POST /api/agent-runs/chain

Pipeline ordenada na worktree já configurada do card. **Body:** `{ worktreeId, title?, body?, steps: [{ id, agentId, model?, effort? } | { id, kind: "breakpoint" }] }`.

- Cada passo só roda quando o anterior terminar `done`.
- `kind: "breakpoint"` = ponto de parada: pipeline pausa até aprovação manual.
- Nome do agente é denormalizado no run (resiliente a delete do agent).

## GET /api/agent-runs

Todos os runs; `?repo=&card=` filtra por card.

## DELETE /api/agent-runs

Apaga TODOS os runs (limpeza da tela `/running`), cancelando processos ativos antes.

## GET /api/agent-runs/attention

Resumo por card (`waiting`/`active`) para sinalizar no board.

## GET /api/agent-runs/:id

Run único. `404` se não existe.

## GET /api/agent-runs/:id/chain

Todos os runs da pipeline a que o run pertence, em ordem (a "conversa").

## POST /api/agent-runs/:id/message

Resposta do usuário a um run parado. **Body:** `{ message }`. Registra a mensagem como turn, re-enfileira com `resume=1` (mesmo `session_id`) e chama `tick()`. `409` se o run está `queued`/`processing`.

## GET /api/agent-runs/:id/log/stream

SSE do log em tempo real.

## GET /api/agent-runs/:id/log?file=

Conteúdo do log. `?file` é validado contra os `logFile` dos turns `exec` (evita path traversal); sem `file`, usa o `log_file` atual.

## POST /api/agent-runs/:id/approve

Aprova um breakpoint aguardando → destrava o próximo passo. `409` se não está aguardando.

## DELETE /api/agent-runs/:id

Apaga um run (cancela o processo antes se `processing`).

## POST /api/agent-runs/:id/cancel

Cancela run `queued` ou `processing` → `status: "error"`, `last_error: "Cancelado pelo usuário."`. `409` se não está ativo.
