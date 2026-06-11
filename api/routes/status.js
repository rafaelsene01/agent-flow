import { cpSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getCache, refresh } from "../modules/status/status.cache.js";
import { PACKAGE_ROOT } from "../paths.js";

export default function statusRoutes(app) {
  app.get("/api/status", (_req, res) => {
    const cached = getCache();
    if (cached) return res.json(cached);
    // Ainda não terminou o warmup — aguarda a primeira leitura real.
    refresh()
      .then((data) => res.json(data))
      .catch((err) => res.status(500).json({ error: err.message }));
  });

  app.post("/api/status", async (_req, res) => {
    try {
      const data = await refresh();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/status/install-skill", async (_req, res) => {
    const src  = join(PACKAGE_ROOT, ".claude", "skills", "tlc-spec-driven");
    const dest = join(homedir(), ".claude", "skills", "tlc-spec-driven");

    if (!existsSync(src)) {
      return res.status(404).json({ error: "Skill não encontrada no projeto." });
    }

    try {
      cpSync(src, dest, { recursive: true });
      const data = await refresh();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
