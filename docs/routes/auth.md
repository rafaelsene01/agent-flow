# Rotas — /api/auth

Fonte: `api/routes/auth.js`. Serviço: [modules/auth.md](../modules/auth.md).

Senha de acesso ao site. Quando `config.authHash` está setado, o guard
(`api/modules/auth/auth.guard.js`) protege **todo** o namespace `/api` — só estas
duas rotas ficam liberadas. Token = o próprio hash; front guarda em cookie (10h) e
reenvia no header `x-agent-flow-auth` (ou `?_auth=` para SSE).

---

### GET /api/auth/status
Liberado sempre. `{ required: boolean }` — se há senha configurada.

### POST /api/auth/login
Liberado sempre. **Body:** `{ password }`. Valida contra o hash salvo.
- `200 { token }` — token = hash, para o front guardar/reenviar.
- `400` senha ausente. `401` senha incorreta.

---

## Guard

`authGuard` roda após essas rotas em `server.js`. Só atua em `/api/*`; assets/HTML do
front passam livres (senão o modal de senha não carregaria). Sem `authHash` → passa
tudo (feature desativada). Com hash → exige token válido no header ou query `?_auth=`
(EventSource não manda header); senão `401 { error: "Unauthorized" }`.

**Leitura de config/status é sempre livre** (mesmo com senha): `/api/status` (GET+POST
recheck) e `GET /api/config*`. O boot precisa delas pra saber se GitHub/Claude estão OK
e decidir mostrar o modal de senha — se protegidas, o 401 abriria a tela de Settings no
lugar. Só a **escrita** de config (`POST/PUT/DELETE`) exige estar logado. O resto do
conteúdo (boards, agents, runs, usage…) segue protegido — é o que dispara o modal.

## Setar/limpar senha

Não há endpoint dedicado — vai por `POST /api/config` (ver [routes/config.md](config.md)),
campo `authPassword`: string não-vazia gera o hash, `""` limpa. O `authHash` nunca é
aceito do cliente nem devolvido no `GET /api/config` (só o booleano `authEnabled`).
