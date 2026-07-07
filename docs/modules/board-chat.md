# Módulo — Board Chat

Fonte: `api/modules/board-chat/board-chat.service.js`

Um chat por board. Persistência na tabela `board_chats` (reusa o SQLite de agent-runs; `board_id` é PK, thread inteiro em JSON na linha — o "continuar chat" restaura a conversa no modal).

---

## Exports

- `getChat(boardId)` → `{ boardId, repo, branch, model, effort, worktreePath, thread, status, error, updatedAt }` ou `null`.
- `startChat({ boardId, repo, branch, model, effort, prompt })` — apaga chat/worktree anteriores, cria worktree via `setupChatWorktree()` ([git.md](git.md)) e roda o primeiro turno. → `{ text }`.
- `sendMessage({ boardId, prompt, model, effort })` — turno seguinte (resume da sessão). → `{ text }`.
- `deleteChat(boardId)` — remove chat + worktree.

Sem log persistido por worktree — o resultado de cada turno volta na própria resposta HTTP (`NOOP_LOG`).

## Status do chat (`status` / `error`)

O chat é registrado **antes** do turno rodar, com a mensagem do usuário no thread e `status = 'running'` — fechar e reabrir o modal durante o processamento mostra a conversa em andamento (o modal faz polling do GET até sair de `running`).

- `running` → turno em execução. `startChat`/`sendMessage` rejeitam envio novo enquanto durar.
- `idle` → turno concluído; thread tem a resposta.
- `error` → turno falhou; mensagem em `error`. Em `sendMessage`, o thread volta ao estado anterior (sem a mensagem pendente). Chats presos em `running` por reinício do servidor são marcados como `error` na primeira carga do módulo.
