# Arquitetura — Modular

Cada domínio é isolado em `api/modules/<modulo>/`. Rotas ficam em `api/routes/`.

---

## Estrutura

```
api/
├── modules/
│   ├── agent-runs/     ← fila e execução de runs (SQLite em ~/.agent-flow/agent-runs.db)
│   ├── agents/         ← CRUD de agents + criador de prompt via Claude
│   ├── board-chat/     ← chat por board (worktree própria + thread em SQLite)
│   ├── claude/         ← runner do Claude CLI, SSE, concorrência
│   ├── config/         ← config global e worktrees (~/.agent-flow/config.json)
│   ├── git/            ← clone + git worktree por card/chat
│   ├── github/         ← client REST/GraphQL, repos, boards, items, branches
│   ├── integrations/   ← Telegram (verify, notificações, poller de respostas)
│   ├── skills/         ← skills do projeto (.claude/skills): CRUD, criador, import/export
│   ├── status/         ← cache do status agregado (github + claude)
│   └── usage/          ← estatísticas de execução (SQLite)
├── routes/
│   ├── config/         ← settings.js, worktrees.js, runner.js, overlay.js
│   ├── agent-runs.js · agents.js · board-chat.js · config.js · github.js
│   ├── integrations.js · skills.js · status.js · usage.js · usage-stats.js
├── lib/errors.js       ← sendError(res, status, message, err)
├── paths.js            ← PACKAGE_ROOT, WEB_DIST_DIR
└── server.js
```

---

## Regras

- Módulo não importa de outro módulo — dependências cruzadas passam por `server.js`.
  (Exceções existentes: `board-chat` reusa o SQLite de `agent-runs`; vários módulos usam `config` e `claude`. Não ampliar sem necessidade.)
- `routes/` só orquestra request/response — sem lógica de negócio.
- `service` contém toda lógica — sem dependência de `req`/`res`.
- `client` faz chamadas HTTP externas — sem lógica de negócio.
- Novo domínio = nova pasta em `modules/` + arquivo em `routes/`. Nunca arquivos soltos em `api/`.
- Erros de rota: usar `sendError` de `api/lib/errors.js`.

---

## Adicionar módulo novo

```
api/modules/novo/
├── novo.service.js
└── novo.client.js    ← se tiver HTTP externo

api/routes/novo.js    ← handlers Express
```

Registrar em `server.js`:
```js
import novoRoutes from "./routes/novo.js";
novoRoutes(app);
```
