# Módulo — Agents

Fonte: `api/modules/agents/`

CRUD de agents (persistidos como JSON) + geração de prompt por entrevista via Claude.

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `agents.service.js` | `listAgents`, `getAgent`, `createAgent`, `updateAgent`, `deleteAgent`, `buildAgentPrompt` |
| `agent-prompt-creator.js` | `runCreatorTurn({ sessionId, prompt, started, model, effort })`, `parseCreatorResponse` |
| `defaults/` | Agents embutidos (`*.json`) + `DEFAULT_AGENTS`, `isDefaultAgentId(id)` |

---

## agents.service.js

- Agent: `{ id, name, prompt, skills, model, effort }`. `name`/`prompt` obrigatórios (erro com "obrigatório" → rota devolve `400`).
- Defaults (`defaults/*.json`: developer, implementer, feature-planner, code-reviewer, commit-push, create-pr, card-description-writer) não podem ser editados/excluídos (erro com "default" → `403`).
- `buildAgentPrompt(id)` — prompt final: skills ativas + prompt do agent + skills linkadas, sem duplicar.

## agent-prompt-creator.js

`runCreatorTurn` roda um turno da entrevista no Claude (sessão nomeada por `sessionId`, resume quando `started`). Resposta parseada para `{ type: "question", question, options }` ou `{ type: "complete", content }`.
