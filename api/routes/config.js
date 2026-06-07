import fs from "fs";

export default function configRoutes(app, state) {
  app.get("/api/config", (_req, res) => {
    res.json(state.config ?? null);
  });

  app.post("/api/config", (req, res) => {
    try {
      const next = req.body;
      if (!next || typeof next !== "object") return res.status(400).json({ error: "Body inválido." });
      fs.writeFileSync(state.configPath, JSON.stringify(next, null, 2), "utf-8");
      state.config = next;
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
