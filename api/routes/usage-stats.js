import { listUsage, clearUsage } from "../modules/usage/usage.store.js";
import { sendError } from "../lib/errors.js";

// Estatísticas de execução dos agentes (tela "/usage") — não confundir com
// /api/usage, que expõe os limites de uso do plano (badge da sidebar).
export default function usageStatsRoutes(app) {
  app.get("/api/usage-stats", (req, res) => {
    try {
      const { repo, days } = req.query;
      const parsedDays = days ? Number(days) : null;
      res.json({
        records: listUsage({
          repo: repo || null,
          days: Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : null,
        }),
      });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.delete("/api/usage-stats", (_req, res) => {
    try {
      res.json({ ok: true, removed: clearUsage() });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });
}
