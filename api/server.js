import fs from "fs";
import path from "path";
import express from "express";
import statusRoutes from "./routes/status.js";
import configRoutes from "./routes/config.js";
import githubRoutes from "./routes/github.js";
import { warmup } from "./modules/status/status.cache.js";
import { warmItemsCache } from "./modules/github/github.items.js";
import { WEB_DIST_DIR } from "./paths.js";
import { getConfig, getWorktrees, updateWorktreeStatus } from "./modules/config/config.service.js";

function recoverInterruptedRuns() {
  const runningStatuses = [
    ["status",          "error", "Run interrompido por reinício do servidor"],
    ["tlcExecStatus",   "error", "Run interrompido por reinício do servidor"],
    ["commitPushStatus","error", "Run interrompido por reinício do servidor"],
  ];
  for (const wt of getWorktrees()) {
    for (const [field, , msg] of runningStatuses) {
      if (wt[field] === "running") {
        const errField = field === "status" ? "lastError"
          : field === "tlcExecStatus" ? "tlcExecLastError"
          : "commitPushLastError";
        updateWorktreeStatus(wt.id, { [field]: "error", [errField]: msg });
      }
    }
  }
}

export async function startServer({ port, apiOnly = false }) {
  if (!apiOnly && !fs.existsSync(WEB_DIST_DIR)) {
    throw new Error(
      `Frontend não encontrado em ${WEB_DIST_DIR}\n` +
      `  Execute "npm run build" antes de usar.`
    );
  }

  recoverInterruptedRuns();

  const app = express();
  app.use(express.json());

  statusRoutes(app);
  configRoutes(app);
  githubRoutes(app);

  if (!apiOnly) {
    app.use(express.static(WEB_DIST_DIR));
    app.use((_req, res) => res.sendFile("index.html", { root: WEB_DIST_DIR }));
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

  // Requisições de items com viewFilter podem varrer várias páginas do GitHub
  // (>30s). Mantém timeouts generosos para não cortar a resposta no meio.
  server.requestTimeout = 180_000; // tempo total da requisição
  server.headersTimeout = 185_000; // deve ser > requestTimeout
  server.keepAliveTimeout = 125_000; // > proxyTimeout do Next (120s)

  warmup();
  // Pré-aquece o cache de itens de cada board para o board carregar instantâneo.
  for (const b of getConfig().boards ?? []) warmItemsCache(b.id);

  return { app, server, url: `http://${host}:${port}` };
}
