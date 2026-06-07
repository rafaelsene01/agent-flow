# Agent Flow — Referência da API

Ponto de entrada: `bin/agent-flow.js` → inicia o Express via `api/server.js`.

> **Arquitetura:** este projeto segue padrão **modular (feature-based)**. Leia [docs/architecture.md](docs/architecture.md) antes de adicionar qualquer módulo.

---

## Rotas

| Método | Caminho | Documentação |
|--------|---------|--------------|
| `GET` | `/api/status` | [docs/routes/status.md](docs/routes/status.md) |

## Módulos

| Módulo | Caminho | Documentação |
|--------|---------|--------------|
| GitHub | `api/modules/github/` | [docs/modules/github.md](docs/modules/github.md) |
| Claude | `api/modules/claude/` | [docs/modules/claude.md](docs/modules/claude.md) |

## Core

| Módulo | Caminho | Documentação |
|--------|---------|--------------|
| Servidor | `api/server.js` | [docs/server.md](docs/server.md) |
| Arquitetura | — | [docs/architecture.md](docs/architecture.md) |
