# Módulo — Skills

Fonte: `api/modules/skills/`

Skills do projeto em `<pacote>/.claude/skills` (ancorado em `PACKAGE_ROOT`, não em `cwd` — a instalação global via `npm i -g` acha as skills embarcadas). Definição: subdiretório com `SKILL.md` ou `<nome>.md` avulso.

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `skills.service.js` | Listagem, ativação, conteúdo, delete |
| `skill-creator.js` | Criação por conversa via Claude + `saveSkill` |
| `transfer.js` | `exportSkill(name)` (zip) / `importSkill(filename, buffer)` |
| `installable.js` | `INSTALLABLE_SKILLS` (catálogo git/local p/ instalar no Claude global), `getInstallState(name)` |

---

## skills.service.js

- `getSkills()` — lista com `{ name, description, active, ... }` (description extraída do frontmatter da SKILL.md).
- `setSkillActive(name, active)` — estado de ativação persistido na config.
- `getActiveSkills()` / `getActiveSkillNames()` — usados por `buildAgentPrompt` ([agents.md](agents.md)).
- `getSkillContent(name)` / `updateSkillContent(name, content)` / `deleteSkill(name)` — erro "não encontrada" → rota devolve `404`.

## skill-creator.js

- `runCreatorTurn({ sessionId, prompt, started, model, effort })` — turno da conversa de criação; resposta parseada (`parseCreatorResponse`) em `{ type: "question", ... }` ou `{ type: "complete", name, content }`.
- `extractFinalText(rawOutput)` — texto final do output do CLI (reusado pelo board-chat).
- `saveSkill(name, content)` — grava `.claude/skills/<name>/SKILL.md`.

## transfer.js

- `exportSkill(name)` → `{ filename, buffer }` — zip da pasta; `SKILL.md` vira `<name>.skill` na raiz.
- `importSkill(filename, buffer)` — aceita `.skill` (arquivo único) ou `.zip` (pacote com `.skill` na raiz).
