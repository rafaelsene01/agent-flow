# Agent Flow — Referência da API

Ponto de entrada: `bin/agent-flow.js` → inicia o Express via `api/server.js`.

> **Arquitetura:** este projeto segue padrão **modular (feature-based)**. Leia [docs/architecture.md](docs/architecture.md) antes de adicionar qualquer módulo.

---

## Rotas

| Método | Caminho | Documentação |
|--------|---------|--------------|
| `GET` | `/api/status` | [docs/routes/status.md](docs/routes/status.md) |

## Clientes

| Módulo | Caminho | Documentação |
|--------|---------|--------------|
| GitHub HTTP | `api/clients/github.js` | [docs/clients/github.md](docs/clients/github.md) |

## Core

| Módulo | Caminho | Documentação |
|--------|---------|--------------|
| Servidor | `api/server.js` | [docs/server.md](docs/server.md) |
| Arquitetura | — | [docs/architecture.md](docs/architecture.md) |
