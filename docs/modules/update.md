# Módulo — Update

Fonte: `api/modules/update/`

Atualização do próprio Agent Flow com autorização do usuário. O servidor só detecta e sinaliza; quem aplica é o supervisor do daemon (`scripts/daemon/daemon.sh`/`daemon.ps1`).

---

## update.service.js

- `getUpdateInfo({ refresh })` — lê a `version` do `package.json` local (`PACKAGE_ROOT`) e a do upstream (`git fetch` + `git show <upstream>:package.json`, cache de 10 min; `refresh: true` força). Retorna `{ current, latest, updateAvailable, activeRuns, updateRequested }`. `activeRuns` vem de `claude.concurrency.getActiveCount()`. Sem clone git, sem upstream ou sem rede → `updateAvailable: false`.
- `requestUpdate()` — revalida com `refresh` e grava a flag `~/.agent-flow/update-requested` (conteúdo: versão alvo). Lança erro `409` se não há atualização.

## Fluxo completo

1. `UpdateBadge` (sidebar) polla `GET /api/update` a cada 60s; badge aparece quando `updateAvailable`.
2. Clique abre `ConfirmDialog`; com `activeRuns > 0`, o texto avisa que os runs serão encerrados (variante destrutiva).
3. Confirmação → `POST /api/update` grava a flag.
4. O supervisor do daemon vê a flag no próximo tick (~15s), remove a flag, roda `git pull --ff-only` + `npm install` + `npm run build`, mata o servidor e todos os claudes derivados (`kill-all.*`) e reinicia na versão nova.
5. Sem o daemon instalado, a flag fica gravada e nada acontece até um supervisor rodar.
