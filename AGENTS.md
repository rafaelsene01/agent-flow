# Agent Flow — Referência da API

Ponto de entrada: `bin/agent-flow.js` → inicia o Express via `api/server.js`.

> **Arquitetura:** este projeto segue padrão **modular (feature-based)**. Leia [docs/architecture.md](docs/architecture.md) antes de adicionar qualquer módulo.

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

## Módulos

| Módulo | Caminho | Documentação |
|--------|---------|--------------|
| GitHub | `api/modules/github/` | [docs/modules/github.md](docs/modules/github.md) |
| Claude | `api/modules/claude/` | [docs/modules/claude.md](docs/modules/claude.md) |
| Config | `api/modules/config/` | [docs/modules/config.md](docs/modules/config.md) |

## Core

| Módulo | Caminho | Documentação |
|--------|---------|--------------|
| Servidor | `api/server.js` | [docs/server.md](docs/server.md) |
| Arquitetura | — | [docs/architecture.md](docs/architecture.md) |
| Frontend (Next.js) | `web/` | [docs/web.md](docs/web.md) |

---

## Regras para manutenção da doc

Ao adicionar ou alterar qualquer rota, módulo ou comportamento relevante:

1. **Nova rota** → adicionar linha na tabela "Rotas" acima + criar/atualizar `docs/routes/<arquivo>.md`
2. **Novo módulo** → adicionar linha na tabela "Módulos" acima + criar `docs/modules/<modulo>.md`
3. **Mudança em módulo existente** → atualizar o `.md` correspondente em `docs/modules/`
4. **Mudança no servidor** → atualizar `docs/server.md`
5. **Mudança de arquitetura** → atualizar `docs/architecture.md`

Doc desatualizada é pior que doc ausente — mantê-la em sincronia com o código.
