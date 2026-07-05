# Rotas — /api/config

Fonte: `api/routes/config.js` → agrega `api/routes/config/{settings,worktrees,runner,overlay}.js`

Config global, worktrees de cards e overlay de arquivos por repo. Serviço: [modules/config.md](../modules/config.md).

---

## settings.js

### GET /api/config
Config atual (ver campos em [modules/config.md](../modules/config.md)).

### POST /api/config
Merge shallow do body sobre a config; retorna a config resultante. `400` se `boards` vier e não for array.

### POST /api/config/browse
Seletor nativo de pasta (`win32` PowerShell `FolderBrowserDialog`, `darwin` `osascript`, `linux` `zenity`/`kdialog`). `200 { path }`, `204` cancelado, `400` plataforma não suportada.

---

## worktrees.js

### GET /api/config/worktrees
Lista os worktrees registrados na config.

### DELETE /api/config/worktrees/:id
Remove worktree: `git worktree remove --force` + `prune` no `repoDir`, apaga o diretório e o `-helpers`. No Windows, se a exclusão travar, mata processos com cwd dentro da pasta via PowerShell e tenta de novo.

### POST /api/config/cleanup-board
**Body:** `{ originRepo: "owner/repo" }`. Apaga tudo do repo: worktrees, `repoDir` (clone), helpers e overlay dir; remove os worktrees da config.

---

## runner.js — chat e arquivos da worktree

### POST /api/config/worktrees/:id/message
Chat do card na worktree. **Body:** `{ message, model?, effort?, sessionId? }`.
- Sem `sessionId` → cria sessão nova em `chatSessions` do worktree; com `sessionId` → retoma (`resumeClaude`, mesmo session id).
- Responde imediato `{ ok, sessionId }` e roda async; progresso via `messageStatus` (`running`/`done`/`error`) e log SSE.
- Respeita o limite de slots de concorrência ([modules/claude.md](../modules/claude.md)).
- Default `model: "sonnet"`, `effort: "medium"`. Envia só o input do usuário, sem prompt injetado.

### POST /api/config/worktrees/:id/cleanup
Remove arquivos internos do run: `CARD.md` no helpers, logs (`agent-flow.log`, `tlc*.log`, `spec-eval.log`) e `.specs/` (compat: também na worktree). Marca `cleanupDone`.

### GET /api/config/worktrees/:id/changed-files
`git status --porcelain -uall` → `{ files: [{ status, path, isDir }] }`. Antes, garante os arquivos internos no `.git/info/exclude`.

### GET /api/config/worktrees/:id/file-content?file=
Conteúdo de arquivo da worktree. `{ content }` (`null` se não existe). Path-guard: `403` fora da worktree.

### PUT /api/config/worktrees/:id/file-content?file=
**Body:** `{ content }`. Grava o arquivo. Mesmo path-guard.

### DELETE /api/config/worktrees/:id/file?file=
Descarta a mudança: untracked → apaga; staged novo (`A`) → unstage + apaga; modificado/renomeado → `git checkout HEAD -- <file>`.

### GET /api/config/worktrees/:id/helpers-files
Lista arquivos do helpers dir: `CARD.md`, `*.log` e `.specs/**/*.md` → `{ files }`.

### GET/PUT /api/config/worktrees/:id/helpers-file?file=
Lê/grava arquivo do helpers dir. Mesmo path-guard.

### GET /api/config/worktrees/:id/log/stream
SSE do log do run atual (CORS `*` — em dev o front na 3001 conecta direto na 5522).

### GET /api/config/worktrees/:id/behind-count
`git fetch` + `rev-list --count HEAD..FETCH_HEAD` → `{ behind }`. Falha silenciosa → `{ behind: 0 }`.

### POST /api/config/worktrees/:id/pull
Roda Claude para trazer `origin/<branch>` resolvendo conflitos (sem commit/push). Async; progresso em `pullStatus`.

---

## overlay.js — arquivos extras por repo

Overlay = arquivos mantidos fora do repo (em `~/.agent-flow/overlays/<repo>`) e aplicados nas worktrees. Todos exigem `?repo=owner/nome`.

| Endpoint | Ação |
|----------|------|
| `GET /api/config/overlay` | Lista `{ files: [{ name, size }] }` (recursivo) |
| `GET /api/config/overlay/file?file=` | `{ name, content }` — `404` se não existe |
| `POST /api/config/overlay` | **Body** `{ name, content }` — grava (máx 1 MB, cria diretórios) |
| `DELETE /api/config/overlay?file=` | Remove o arquivo |

Path-guard em todos: `400 "Path não permitido"` fora do overlay dir.
