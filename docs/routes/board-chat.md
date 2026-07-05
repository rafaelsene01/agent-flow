# Rotas — /api/board-chat

Fonte: `api/routes/board-chat.js` — lógica em [modules/board-chat.md](../modules/board-chat.md).

Um chat por board (`boardId` = node ID do GitHub, ex. `PVT_kwHO…`; validado por regex → `400`).

---

## GET /api/board-chat/:boardId

Chat registrado do board ou `{ chat: null }` — decide entre "continuar/novo" e "novo direto" no modal.

## POST /api/board-chat/:boardId/start

Inicia chat novo: apaga chat/worktree anteriores do board, cria worktree na branch e roda o primeiro turno.

**Body:** `{ repo: "owner/nome", branch, prompt, model?, effort? }` (os 3 primeiros obrigatórios). **Resposta:** `{ text }`.

## POST /api/board-chat/:boardId/message

Turno seguinte do chat existente. **Body:** `{ prompt, model?, effort? }`. **Resposta:** `{ text }`.
