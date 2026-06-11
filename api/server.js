import fs from "fs";
import path from "path";
import express from "express";
import statusRoutes from "./routes/status.js";
import configRoutes from "./routes/config.js";
import githubRoutes from "./routes/github.js";
import { warmup } from "./modules/status/status.cache.js";
import { WEB_DIST_DIR } from "./paths.js";

export async function startServer({ port, apiOnly = false }) {
  if (!apiOnly && !fs.existsSync(WEB_DIST_DIR)) {
    throw new Error(
      `Frontend não encontrado em ${WEB_DIST_DIR}\n` +
      `  Execute "npm run build" antes de usar.`
    );
  }

  const app = express();
  app.use(express.json());

  statusRoutes(app);
  configRoutes(app);
  githubRoutes(app);

  if (!apiOnly) {
    app.use(express.static(WEB_DIST_DIR));
    app.use((_req, res) => res.sendFile(path.join(WEB_DIST_DIR, "index.html")));
  }

  // Garante que erros não capturados retornem JSON, nunca "Internal Server Error" em texto.
  app.use((err, _req, res, _next) => {
    console.error("[server error]", err);
    if (res.headersSent) return;
    res.status(500).json({ error: err?.message ?? String(err) });
  });

  const host = "localhost";
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.on("error", (err) => {
      reject(err.code === "EADDRINUSE"
        ? new Error(`Porta ${port} já está em uso. Use --port para escolher outra.`)
        : err);
    });
  });

  warmup();

  return { app, server, url: `http://${host}:${port}` };
}
