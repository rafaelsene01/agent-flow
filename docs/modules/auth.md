# Módulo — Auth

Fonte: `api/modules/auth/`

Senha de acesso ao site. Guarda só o hash (sha256 hex) em `config.authHash` — texto
puro nunca persiste. O hash funciona como bearer token. Rotas: [routes/auth.md](../routes/auth.md).

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `auth.service.js` | Hash, get/set/clear da senha, verificação (timing-safe) |
| `auth.guard.js` | Middleware que protege `/api/*` quando há senha |

## auth.service.js

- `hashPassword(plain)` — sha256 hex.
- `getAuthHash()` — hash salvo ou `null` (null/`""` contam como null).
- `isAuthRequired()` — `!!getAuthHash()`.
- `setPassword(plain)` / `clearPassword()` — grava/limpa `config.authHash`.
- `verifyPassword(plain)` / `verifyToken(token)` — compara com o hash; `timingSafeEqual`.

## auth.guard.js

- `authGuard(req, res, next)` — só atua em `/api/*`; sem `authHash` passa tudo. Token
  no header `AUTH_HEADER` (`x-agent-flow-auth`) ou query `AUTH_QS` (`_auth`, para SSE).
  Inválido → `401`. Livre mesmo com senha: `/api/auth/*`, `/api/status` (GET+POST) e
  `GET /api/config*` (leitura de config/status pro boot); só a escrita de config exige login.
- Exports: `AUTH_HEADER`, `AUTH_QS`.

## Front

- `web/lib/auth.js` — cookie `af_auth` (10h), monkey-patch em `window.fetch` (injeta
  header, detecta 401), `withAuthQs(url)` para EventSource, `onUnauthorized(cb)`.
- `web/components/AuthGate.jsx` + `PasswordModal.jsx` — modal no 401.
- Setar/limpar senha na tela de Settings (`SettingsModal.jsx`) via `POST /api/config`
  campo `authPassword`.
