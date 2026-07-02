import {
  getSkills,
  setSkillActive,
  getSkillContent,
  updateSkillContent,
  deleteSkill,
} from "../modules/skills/skills.service.js";
import { runCreatorTurn, saveSkill } from "../modules/skills/skill-creator.js";
import { sendError } from "../lib/errors.js";

// Nomes de skill são basenames de diretório/arquivo — bloqueia path traversal.
const NAME_RE = /^[a-zA-Z0-9._-]+$/;

export default function skillsRoutes(app) {
  // R3: lista as skills de ~/.claude/skills com o estado de ativação.
  app.get("/api/skills", (_req, res) => {
    try {
      res.json({ skills: getSkills() });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  // R4: ativa/desativa uma skill e retorna a lista atualizada.
  app.post("/api/skills/toggle", async (req, res) => {
    const { name, active } = req.body ?? {};
    if (typeof name !== "string" || !name.trim()) return sendError(res, 400, "name obrigatório");
    if (typeof active !== "boolean") return sendError(res, 400, "active deve ser boolean");
    try {
      await setSkillActive(name, active);
      res.json({ skills: getSkills() });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  // Um turno da conversa de criação de skill (skill-creator via wrapper estruturado).
  // Retorna { type: "question", question, options } ou { type: "complete", name, content }.
  app.post("/api/skills/create/message", async (req, res) => {
    const { sessionId, prompt, started, model, effort } = req.body ?? {};
    if (typeof sessionId !== "string" || !/^[a-zA-Z0-9-]+$/.test(sessionId))
      return sendError(res, 400, "sessionId inválido");
    if (typeof prompt !== "string" || !prompt.trim())
      return sendError(res, 400, "prompt obrigatório");
    try {
      const result = await runCreatorTurn({
        sessionId,
        prompt,
        started: !!started,
        model,
        effort,
      });
      res.json(result);
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  // Conteúdo bruto da SKILL.md (para edição).
  app.get("/api/skills/:name/content", (req, res) => {
    const { name } = req.params;
    if (!NAME_RE.test(name)) return sendError(res, 400, "Nome inválido");
    try {
      res.json({ content: getSkillContent(name) });
    } catch (err) {
      sendError(res, /não encontrada/.test(err.message) ? 404 : 500, err.message, err);
    }
  });

  // Atualiza o conteúdo de uma skill existente.
  app.put("/api/skills/:name/content", (req, res) => {
    const { name } = req.params;
    if (!NAME_RE.test(name)) return sendError(res, 400, "Nome inválido");
    const { content } = req.body ?? {};
    if (typeof content !== "string") return sendError(res, 400, "Conteúdo inválido");
    try {
      updateSkillContent(name, content);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, /não encontrada/.test(err.message) ? 404 : 500, err.message, err);
    }
  });

  // Exclui uma skill do projeto e devolve a lista atualizada.
  app.delete("/api/skills/:name", async (req, res) => {
    const { name } = req.params;
    if (!NAME_RE.test(name)) return sendError(res, 400, "Nome inválido");
    try {
      await deleteSkill(name);
      res.json({ ok: true, skills: getSkills() });
    } catch (err) {
      sendError(res, /não encontrada/.test(err.message) ? 404 : 500, err.message, err);
    }
  });

  // Salva a skill gerada em .claude/skills/<name>/SKILL.md e devolve a lista atualizada.
  app.post("/api/skills/create/save", (req, res) => {
    const { name, content } = req.body ?? {};
    try {
      const saved = saveSkill(name, content);
      res.json({ ok: true, ...saved, skills: getSkills() });
    } catch (err) {
      const status = /inválid|vazio|já existe/i.test(err.message) ? 400 : 500;
      sendError(res, status, err.message, status === 500 ? err : null);
    }
  });
}
