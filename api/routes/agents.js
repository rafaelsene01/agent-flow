import { listAgents, createAgent, updateAgent, deleteAgent, buildAgentPrompt } from "../modules/agents/agents.service.js";
import { sendError } from "../lib/errors.js";

export default function agentsRoutes(app) {
  // Lista os agents criados.
  app.get("/api/agents", (_req, res) => {
    try {
      res.json({ agents: listAgents() });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  // Cria um agent (name, prompt, skills) e retorna a lista atualizada.
  app.post("/api/agents", async (req, res) => {
    const { name, prompt, skills, model, effort } = req.body ?? {};
    try {
      await createAgent({ name, prompt, skills, model, effort });
      res.json({ agents: listAgents() });
    } catch (err) {
      // Erros de validação (name/prompt obrigatório) → 400; o resto → 500.
      const status = /obrigatório/.test(err.message) ? 400 : 500;
      sendError(res, status, err.message, status === 500 ? err : null);
    }
  });

  // Edita um agent existente e retorna a lista atualizada.
  app.put("/api/agents/:id", async (req, res) => {
    const { name, prompt, skills, model, effort } = req.body ?? {};
    try {
      await updateAgent(req.params.id, { name, prompt, skills, model, effort });
      res.json({ agents: listAgents() });
    } catch (err) {
      // Default (não editável) → 403; não encontrado → 404; validação → 400; resto → 500.
      const status = /default/.test(err.message)
        ? 403
        : /não encontrado/.test(err.message)
          ? 404
          : /obrigatório/.test(err.message)
            ? 400
            : 500;
      sendError(res, status, err.message, status === 500 ? err : null);
    }
  });

  // Remove um agent e retorna a lista atualizada.
  app.delete("/api/agents/:id", async (req, res) => {
    try {
      await deleteAgent(req.params.id);
      res.json({ agents: listAgents() });
    } catch (err) {
      // Default (não excluível) → 403; não encontrado → 404; resto → 500.
      const status = /default/.test(err.message)
        ? 403
        : /não encontrado/.test(err.message)
          ? 404
          : 500;
      sendError(res, status, err.message, status === 500 ? err : null);
    }
  });

  // Monta e retorna o prompt final do agent (skills ativas + prompt + linkadas, sem duplicar).
  app.get("/api/agents/:id/prompt", (req, res) => {
    try {
      res.json({ prompt: buildAgentPrompt(req.params.id) });
    } catch (err) {
      const status = /não encontrado/.test(err.message) ? 404 : 500;
      sendError(res, status, err.message, status === 500 ? err : null);
    }
  });
}
