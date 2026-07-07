# Rotas — /api/board-chat

Fonte: `api/routes/board-chat.js` — lógica em [modules/board-chat.md](../modules/board-chat.md).

Um chat por board (`boardId` = node ID do GitHub, ex. `PVT_kwHO…`; validado por regex → `400`).

---

## GET /api/board-chat/:boardId

Chat registrado do board ou `{ chat: null }` — decide entre "continuar/novo" e "novo direto" no modal. O chat inclui `status` (`running` | `idle` | `error`) e `error`; com `status: "running"` o modal acompanha o turno em andamento via polling deste GET ([modules/board-chat.md](../modules/board-chat.md#status-do-chat-status--error)).

## POST /api/board-chat/:boardId/start

Inicia chat novo: apaga chat/worktree anteriores do board, registra o chat como `running` (antes do turno), cria worktree na branch e roda o primeiro turno.

**Body:** `{ repo: "owner/nome", branch, prompt, model?, effort? }` (os 3 primeiros obrigatórios). **Resposta:** `{ text }`. `500` se já houver turno em processamento no board.

## POST /api/board-chat/:boardId/message

Turno seguinte do chat existente. **Body:** `{ prompt, model?, effort? }`. **Resposta:** `{ text }`. `500` se já houver turno em processamento.
