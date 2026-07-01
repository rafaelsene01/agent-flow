import { getSkills, setSkillActive } from "../modules/skills/skills.service.js";
import { sendError } from "../lib/errors.js";

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
}
