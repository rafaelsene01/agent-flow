# Módulo — Config

Fonte: `api/modules/config/config.service.js`

Persiste a config global em `~/.agent-flow/config.json`. Escritas passam por uma fila interna (`writeChain`) para evitar corrida read→write.

---

## Paths

| Path | Descrição |
|------|-----------|
| `~/.agent-flow/config.json` | Config |
| `~/.agent-flow/projects/` | Clones e worktrees (criado no boot) |

## Campos (DEFAULTS)

| Campo | Padrão | Descrição |
|-------|--------|-----------|
| `projectsPath` | `~/.agent-flow/projects` | Base dos projetos |
| `boards` | `[]` | Boards salvos |
| `maxConcurrentRuns` | `3` | Slots de execução do Claude |
| `runTimeoutMinutes` | `30` | Timeout de run |
| `language` | `"en"` | Idioma das instruções aos agentes (`"pt"` \| `"en"`) |
| `githubMethod` | — | Auth detectada: `"env"` \| `"gh-cli"` |
| `worktrees` | — | Worktrees registradas (cards) |
| `integrations.telegram` | — | `{ botToken, chatId }` |

## Exports

- `getConfig()` / `setConfig(updates)` — leitura / merge shallow + save
- `getLanguage()`
- `getWorktrees()` / `registerWorktree({ owner, repo, branch, originBranch, cardNumber, repoDir, worktreeDir })` / `removeWorktree(id)`
- `updateWorktreeStatus(id, updates)` — patcha campos de status (`messageStatus`, `pullStatus`, `cleanupDone`, …)
- `appendChatSession(id, entry)` / `updateChatSession(id, sessionId, patch)` — sessões de chat da worktree (`chatSessions`)
- `getHelpersDir(wt)` — diretório `-helpers` da worktree (CARD.md, logs, `.specs/`)
- `getOverlayDir(originRepo)` — diretório de overlay do repo
