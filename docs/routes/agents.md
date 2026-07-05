# Rotas — /api/agents

Fonte: `api/routes/agents.js` — lógica em [modules/agents.md](../modules/agents.md).

Agent = `{ id, name, prompt, skills, model, effort }`. Mutações retornam `{ agents }` atualizado. Agents default (embutidos) não são editáveis/excluíveis → `403`.

---

## GET /api/agents

Lista os agents (defaults + criados).

## POST /api/agents

Cria agent. **Body:** `{ name, prompt, skills?, model?, effort? }`. Validação (`name`/`prompt` obrigatórios) → `400`.

## PUT /api/agents/:id

Edita agent. `403` default, `404` não encontrado, `400` validação.

## DELETE /api/agents/:id

Remove agent. `403` default, `404` não encontrado.

## POST /api/agents/create/message

Um turno da entrevista de geração de prompt via Claude. **Body:** `{ sessionId, prompt, started?, model?, effort? }` — `sessionId` alfanumérico com `-`.

**Resposta:** `{ type: "question", question, options }` ou `{ type: "complete", content }`.

## GET /api/agents/:id/prompt

Prompt final montado (skills ativas + prompt + skills linkadas, sem duplicar). `404` se não existe.
