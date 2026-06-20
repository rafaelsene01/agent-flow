import fs from "fs";
import path from "path";
import { getWorktrees, updateWorktreeStatus, getHelpersDir } from "../../modules/config/config.service.js";
import { sendError } from "../../lib/errors.js";

export function scanTlcFeatures(worktreePath) {
  const featuresDir = path.join(worktreePath, ".specs", "features");
  if (!fs.existsSync(featuresDir)) return null;

  const dirs = fs.readdirSync(featuresDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, mtime: fs.statSync(path.join(featuresDir, d.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (dirs.length === 0) return null;

  const tlcFeaturePath = path.join(featuresDir, dirs[0].name);
  const tlcFiles = {};
  for (const type of ["spec", "design", "tasks"]) {
    tlcFiles[type] = fs.existsSync(path.join(tlcFeaturePath, `${type}.md`));
  }
  return { tlcFeaturePath, tlcFiles };
}

export default function tlcRoutes(app) {
  app.get("/api/config/worktrees/:id/tlc-scan", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                     return sendError(res, 404, "Worktree não encontrado");
    if (!fs.existsSync(wt.path)) return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    const result = scanTlcFeatures(getHelpersDir(wt));
    if (!result) return res.json({ tlcFeaturePath: null, tlcFiles: { spec: false, design: false, tasks: false } });

    updateWorktreeStatus(id, { tlcFeaturePath: result.tlcFeaturePath, tlcFiles: result.tlcFiles });
    res.json(result);
  });

  app.get("/api/config/worktrees/:id/tlc-file/:type", (req, res) => {
    const id   = decodeURIComponent(req.params.id);
    const type = req.params.type;
    if (!["spec", "design", "tasks"].includes(type)) return sendError(res, 400, "Tipo inválido");

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado");

    let featurePath = wt.tlcFeaturePath;
    if (!featurePath || !fs.existsSync(featurePath)) {
      const scanned = scanTlcFeatures(getHelpersDir(wt));
      if (!scanned) return sendError(res, 404, "Nenhum feature TLC encontrado na worktree");
      featurePath = scanned.tlcFeaturePath;
      updateWorktreeStatus(id, { tlcFeaturePath: scanned.tlcFeaturePath, tlcFiles: scanned.tlcFiles });
    }

    const filePath = path.join(featurePath, `${type}.md`);
    if (!fs.existsSync(filePath)) return sendError(res, 404, `${type}.md não encontrado`);

    res.json({ content: fs.readFileSync(filePath, "utf-8"), filePath });
  });

  app.put("/api/config/worktrees/:id/tlc-file/:type", (req, res) => {
    const id      = decodeURIComponent(req.params.id);
    const type    = req.params.type;
    const { content } = req.body ?? {};
    if (!["spec", "design", "tasks"].includes(type)) return sendError(res, 400, "Tipo inválido");
    if (typeof content !== "string") return sendError(res, 400, "Conteúdo inválido");

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado");

    let featurePath = wt.tlcFeaturePath;
    if (!featurePath || !fs.existsSync(featurePath)) {
      const scanned = scanTlcFeatures(getHelpersDir(wt));
      if (!scanned) return sendError(res, 404, "Nenhum feature TLC encontrado na worktree");
      featurePath = scanned.tlcFeaturePath;
      updateWorktreeStatus(id, { tlcFeaturePath: scanned.tlcFeaturePath, tlcFiles: scanned.tlcFiles });
    }

    const filePath = path.join(featurePath, `${type}.md`);
    try {
      fs.writeFileSync(filePath, content, "utf-8");
      res.json({ ok: true });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });
}
