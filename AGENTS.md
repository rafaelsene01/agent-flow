# Agent Flow — Índice para agentes

Orquestrador de agentes Claude sobre boards do GitHub Projects. API Express (`api/`) + frontend Next.js (`web/`). Ponto de entrada: `bin/agent-flow.js` → `api/server.js`.

> Este arquivo é só um índice — não descreve nada em detalhe. Abra a doc do domínio que a tarefa tocar; cada uma tem endpoints, params, respostas e comportamentos. Antes de criar/alterar módulos, leia [docs/architecture.md](docs/architecture.md).

## Domínios

| Domínio | Prefixo | Rotas | Módulos |
|---------|---------|-------|---------|
| Status/instalação | `/api/status*` | [routes/status.md](docs/routes/status.md) | [status](docs/modules/status.md) |
| Auth (senha de acesso) | `/api/auth/*` | [routes/auth.md](docs/routes/auth.md) | [auth](docs/modules/auth.md) |
| Config, worktrees, overlay | `/api/config*` | [routes/config.md](docs/routes/config.md) | [config](docs/modules/config.md) |
| GitHub (repos, boards, branches) | `/api/github/*` | [routes/github.md](docs/routes/github.md) | [github](docs/modules/github.md), [git](docs/modules/git.md) |
| Agents (CRUD, criador de prompt) | `/api/agents*` | [routes/agents.md](docs/routes/agents.md) | [agents](docs/modules/agents.md) |
| Runs de agentes (fila, pipeline) | `/api/agent-runs*` | [routes/agent-runs.md](docs/routes/agent-runs.md) | [agent-runs](docs/modules/agent-runs.md) |
| Chat do board | `/api/board-chat/*` | [routes/board-chat.md](docs/routes/board-chat.md) | [board-chat](docs/modules/board-chat.md) |
| Skills | `/api/skills*` | [routes/skills.md](docs/routes/skills.md) | [skills](docs/modules/skills.md) |
| Uso (limites do plano + estatísticas) | `/api/usage`, `/api/usage-stats` | [routes/usage.md](docs/routes/usage.md) | [usage](docs/modules/usage.md) |
| Integrações (Telegram) | `/api/integrations/*` | [routes/integrations.md](docs/routes/integrations.md) | [integrations](docs/modules/integrations.md) |
| Update (versão nova + autorização) | `/api/update` | [routes/update.md](docs/routes/update.md) | [update](docs/modules/update.md) |

## Infra compartilhada

| O quê | Onde | Doc |
|-------|------|-----|
| Servidor Express (boot, static, timeouts) | `api/server.js` | [docs/server.md](docs/server.md) |
| Runner do Claude CLI (spawn, SSE, concorrência) | `api/modules/claude/` | [docs/modules/claude.md](docs/modules/claude.md) |
| Frontend Next.js | `web/` | [docs/web.md](docs/web.md) |
| Arquitetura e regras de módulos | — | [docs/architecture.md](docs/architecture.md) |
| **Providers (Source de cards + Repo de código)** | `api/modules/sources`, `api/modules/repos`, `api/modules/github` | [docs/providers.md](docs/providers.md) |

> **Multi-provider por design.** GitHub é a única implementação, mas board/item/coluna
> (Source) e repo/branch/clone (Repo) passam por contratos plugáveis. Antes de tocar
> nesses domínios leia [docs/providers.md](docs/providers.md) e siga as regras duras
> (nada de `github.com`/`gh`/`graphQL` fora de `modules/github/`; nada de `if provider === "github"`;
> frontend nunca chama `/api/github/*`). Planejamento do refactor: [.specs/features/provider-abstraction/](.specs/features/provider-abstraction/).

## Comportamentos intencionais (não tratar como bug)

- **Model/effort por passo sobrepõe a config do agente.** Em `api/routes/agent-runs.js`
  (`step.model || agent.model`, `step.effort || agent.effort`), o model/effort enviado
  pela UI ao montar a chain tem precedência sobre o que está no JSON do agente
  (ex.: rodar o Feature Planner em `haiku`/`low` mesmo com o default `opus`/`high`).
  É uma escolha deliberada do usuário na tela de configuração do passo — não
  "corrigir" a precedência nem apontar como erro em reviews.

- **Default de provider é `github` na leitura.** `board.source ?? "github-board"` e
  `host ?? "github"` (worktrees/repos) são back-compat proposital para config antigo —
  não exigir os campos nem migrar `config.json` em disco. Ver [docs/providers.md](docs/providers.md).

## Manutenção da doc

- Novo endpoint → seção no `docs/routes/<domínio>.md` existente.
- Novo domínio → linha na tabela acima + `docs/routes/<domínio>.md` + `docs/modules/<modulo>.md`.
- Mudança em módulo/rota → atualizar o `.md` correspondente.
- Este índice fica enxuto: só tabelas e links, sem detalhe de endpoint.
