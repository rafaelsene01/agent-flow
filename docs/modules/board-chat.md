# Módulo — Board Chat

Fonte: `api/modules/board-chat/board-chat.service.js`

Um chat por board. Persistência na tabela `board_chats` (reusa o SQLite de agent-runs; `board_id` é PK, thread inteiro em JSON na linha — o "continuar chat" restaura a conversa no modal).

---

## Exports

- `getChat(boardId)` → `{ boardId, repo, branch, model, effort, worktreePath, thread, updatedAt }` ou `null`.
- `startChat({ boardId, repo, branch, model, effort, prompt })` — apaga chat/worktree anteriores, cria worktree via `setupChatWorktree()` ([git.md](git.md)) e roda o primeiro turno. → `{ text }`.
- `sendMessage({ boardId, prompt, model, effort })` — turno seguinte (resume da sessão). → `{ text }`.
- `deleteChat(boardId)` — remove chat + worktree.

Sem log persistido por worktree — o resultado de cada turno volta na própria resposta HTTP (`NOOP_LOG`).
