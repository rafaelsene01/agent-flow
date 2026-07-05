# Rotas — /api/skills

Fonte: `api/routes/skills.js` — lógica em [modules/skills.md](../modules/skills.md).

Skills do projeto (`<pacote>/.claude/skills`). Nomes validados por regex (basename — bloqueia path traversal) → `400`.

---

## GET /api/skills

Lista skills com estado de ativação: `{ skills }`.

## POST /api/skills/toggle

**Body:** `{ name, active: boolean }`. Ativa/desativa e retorna `{ skills }`.

## POST /api/skills/create/message

Um turno da conversa de criação de skill (skill-creator via wrapper estruturado). **Body:** `{ sessionId, prompt, started?, model?, effort? }`.

**Resposta:** `{ type: "question", question, options }` ou `{ type: "complete", name, content }`.

## POST /api/skills/create/save

Salva a skill gerada em `.claude/skills/<name>/SKILL.md`. **Body:** `{ name, content }`. `400` inválido/vazio/já existe.

## GET /api/skills/:name/content

Conteúdo bruto da `SKILL.md` (edição): `{ content }`. `404` se não existe.

## PUT /api/skills/:name/content

**Body:** `{ content }`. Atualiza skill existente.

## DELETE /api/skills/:name

Exclui a skill → `{ ok, skills }`.

## GET /api/skills/:name/export

Zip da pasta da skill (`SKILL.md` vira `<name>.skill` na raiz). Download `application/zip`.

## POST /api/skills/import?filename=

Importa `.skill` (arquivo único) ou `.zip` (pacote com um `.skill` na raiz). Body = binário bruto (`express.raw`, limite 25 MB); extensão resolvida pelo `?filename=`. `400` arquivo inválido/já existe.
