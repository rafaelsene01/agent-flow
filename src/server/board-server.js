import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIST_DIR = path.resolve(__dirname, "../../web/dist");

function ensureFrontendBuildExists() {
  if (fs.existsSync(path.join(WEB_DIST_DIR, "index.html"))) return;

  const buildCommand = process.platform === "win32" ? "npm run build:web" : "npm run build:web";
  const result = spawnSync(buildCommand, {
    cwd: path.resolve(__dirname, "../.."),
    shell: true,
    stdio: "inherit",
  });

  if (result.status !== 0 || !fs.existsSync(path.join(WEB_DIST_DIR, "index.html"))) {
    throw new Error("Não foi possível gerar o frontend web automaticamente.");
  }
}

export async function startBoardServer({ config, teamId, fetchBoard, port }) {
  ensureFrontendBuildExists();

  const app = express();

  app.get("/api/board", async (_req, res) => {
    try {
      const board = await fetchBoard(config, teamId);
      res.json(board);
    } catch (error) {
      res.status(500).json({
        error: error.message || "Falha ao carregar dados do board.",
      });
    }
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint da API não encontrado." });
  });

  app.use(express.static(WEB_DIST_DIR));

  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST_DIR, "index.html"));
  });

  const host = "localhost";

  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
    instance.on("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        reject(new Error(`A porta ${port} já está em uso. Use -p/--port para escolher outra.`));
        return;
      }
      reject(error);
    });
  });

  return {
    app,
    server,
    url: `http://${host}:${port}`,
  };
}
