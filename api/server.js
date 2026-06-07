import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import statusRoutes from "./routes/status.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST_DIR = path.resolve(__dirname, "../web/out");

export async function startServer({ port }) {
  if (!fs.existsSync(WEB_DIST_DIR)) {
    throw new Error(
      `Frontend não encontrado em ${WEB_DIST_DIR}\n` +
      `  Execute "npm run build:web" antes de usar.`
    );
  }

  const app = express();
  app.use(express.json());

  statusRoutes(app);

  app.use(express.static(WEB_DIST_DIR));
  app.use((_req, res) => res.sendFile(path.join(WEB_DIST_DIR, "index.html")));

  const host = "localhost";
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.on("error", (err) => {
      reject(err.code === "EADDRINUSE"
        ? new Error(`Porta ${port} já está em uso. Use --port para escolher outra.`)
        : err);
    });
  });

  return { app, server, url: `http://${host}:${port}` };
}
