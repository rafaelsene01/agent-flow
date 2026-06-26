import fs from "fs";
import path from "path";
import { getOverlayDir } from "../../modules/config/config.service.js";
import { sendError } from "../../lib/errors.js";

const MAX_FILE_SIZE = 1_048_576; // 1 MB

function resolveFilePath(overlayDir, fileName) {
  const resolved = path.resolve(overlayDir);
  const fullPath = path.resolve(overlayDir, fileName);
  if (!fullPath.startsWith(resolved + path.sep) && fullPath !== resolved)
    return null;
  return fullPath;
}

export default function overlayRoutes(app) {
  app.get("/api/config/overlay", (req, res) => {
    const { repo } = req.query;
    if (!repo) return sendError(res, 400, "repo obrigatório");

    const overlayDir = getOverlayDir(repo);
    try {
      const entries = fs.readdirSync(overlayDir, { recursive: true, withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => {
          const name = path.relative(overlayDir, path.join(e.parentPath ?? e.path, e.name)).replace(/\\/g, "/");
          const size = fs.statSync(path.join(e.parentPath ?? e.path, e.name)).size;
          return { name, size };
        });
      res.json({ files });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.get("/api/config/overlay/file", (req, res) => {
    const { repo, file } = req.query;
    if (!repo) return sendError(res, 400, "repo obrigatório");
    if (!file) return sendError(res, 400, "file obrigatório");

    const overlayDir = getOverlayDir(repo);
    const fullPath = resolveFilePath(overlayDir, file);
    if (!fullPath) return sendError(res, 400, "Path não permitido");

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      res.json({ name: file, content });
    } catch (err) {
      if (err.code === "ENOENT") return sendError(res, 404, "Arquivo não encontrado");
      sendError(res, 500, err.message, err);
    }
  });

  app.post("/api/config/overlay", (req, res) => {
    const { repo } = req.query;
    const { name, content } = req.body ?? {};
    if (!repo) return sendError(res, 400, "repo obrigatório");
    if (!name) return sendError(res, 400, "name obrigatório");
    if (content === undefined || content === null) return sendError(res, 400, "content obrigatório");

    const overlayDir = getOverlayDir(repo);
    const fullPath = resolveFilePath(overlayDir, name);
    if (!fullPath) return sendError(res, 400, "Path não permitido");

    const buf = Buffer.byteLength(content, "utf-8");
    if (buf > MAX_FILE_SIZE) return sendError(res, 400, "Arquivo excede limite de 1 MB");

    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf-8");
      res.json({ ok: true });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.delete("/api/config/overlay", (req, res) => {
    const { repo, file } = req.query;
    if (!repo) return sendError(res, 400, "repo obrigatório");
    if (!file) return sendError(res, 400, "file obrigatório");

    const overlayDir = getOverlayDir(repo);
    const fullPath = resolveFilePath(overlayDir, file);
    if (!fullPath) return sendError(res, 400, "Path não permitido");

    try {
      fs.rmSync(fullPath, { force: true });
      res.json({ ok: true });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });
}
