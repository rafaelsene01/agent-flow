# Agent Flow — Referência da API

Ponto de entrada: `bin/agent-flow.js` → inicia o Express via `api/server.js`.

> Leia [docs/architecture.md](docs/architecture.md) antes de adicionar módulos.

---

## Rotas

| Método | Caminho | Documentação |
|--------|---------|--------------|
| `GET` | `/api/status` | [docs/routes/status.md](docs/routes/status.md) |
| `GET` | `/api/config` | [docs/routes/config.md](docs/routes/config.md) |
| `POST` | `/api/config` | [docs/routes/config.md](docs/routes/config.md) |
| `POST` | `/api/config/browse` | [docs/routes/config.md](docs/routes/config.md) |
| `GET` | `/api/github/repos` | [docs/routes/github.md](docs/routes/github.md) |
| `GET` | `/api/github/boards` | [docs/routes/github.md](docs/routes/github.md) |
| `GET` | `/api/github/boards/:id/items` | [docs/routes/github.md](docs/routes/github.md) |
| `GET` | `/api/github/boards/:id/views` | [docs/routes/github.md](docs/routes/github.md) |
| `GET` | `/api/github/boards/:id/columns` | [docs/routes/github.md](docs/routes/github.md) |

## Módulos

| Módulo | Caminho | Documentação |
|--------|---------|--------------|
| GitHub | `api/modules/github/` | [docs/modules/github.md](docs/modules/github.md) |
| Claude | `api/modules/claude/` | [docs/modules/claude.md](docs/modules/claude.md) |
| Config | `api/modules/config/` | [docs/modules/config.md](docs/modules/config.md) |

## Core

| Arquivo | Documentação |
|---------|--------------|
| `api/server.js` | [docs/server.md](docs/server.md) |
| `web/` | [docs/web.md](docs/web.md) |
| Arquitetura | [docs/architecture.md](docs/architecture.md) |

---

## Manutenção da doc

- Nova rota → linha na tabela + `docs/routes/<arquivo>.md`
- Novo módulo → linha na tabela + `docs/modules/<modulo>.md`
- Mudança em módulo/rota → atualizar o `.md` correspondente
