# Módulo — Git

Fonte: `api/modules/git/git.worktree.js`

Clona repos e cria `git worktree` por card ou por chat de board, sob `config.projectsPath`.

---

## `setupWorktree({ owner, repo, newBranch, originBranch, cardNumber })`

1. Procura clone existente em `projectsPath` (qualquer diretório cujo `origin` case com `owner/repo`) — só clona se não achar (URL com token de `getToken()` quando disponível).
2. Cria a branch a partir de `originBranch` (se não existir) e a worktree em `projectsPath/<repo>-<cardNumber>`.
3. `newBranch === originBranch` → modo checkout-only: não cria branch nova, só faz checkout da branch de origem na worktree (`worktree add -f`, pois ela pode já estar em checkout no clone principal).
4. Registra na config (`registerWorktree`) e aplica o overlay do repo ([routes/config.md](../routes/config.md#overlayjs--arquivos-extras-por-repo)).

Retorna `{ worktreeDir, helpersDir, cloned }`. O helpers dir (`<worktree>-helpers`) guarda CARD.md, logs e `.specs/` fora do repo.

## `setupChatWorktree({ owner, repo, branch, boardId })`

Variante para o chat do board: worktree na branch existente, nomeada pelo board.
