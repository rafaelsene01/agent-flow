import { getStatus as getGithubStatus } from "../modules/github/github.service.js";
import { getStatus as getClaudeStatus } from "../modules/claude/claude.service.js";

export default function statusRoutes(app) {
  app.get("/api/status", async (_req, res) => {
    try {
      const [github, claude] = await Promise.all([getGithubStatus(), getClaudeStatus()]);
      res.json({ platform: process.platform, github, claude });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
