import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getConfig, setConfig, getWorktrees, removeWorktree } from "../../modules/config/config.service.js";
import { sendError } from "../../lib/errors.js";

const execFileP = promisify(execFile);

export default function worktreesRoutes(app) {
  app.get("/api/config/worktrees", (_req, res) => {
    res.json(getWorktrees());
  });

  app.delete("/api/config/worktrees/:id", async (req, res) => {
    const id = decodeURIComponent(req.params.id);
    try {
      const wt = getWorktrees().find((w) => w.id === id);
      if (wt) {
        if (wt.repoDir && fs.existsSync(wt.repoDir)) {
          await execFileP("git", ["worktree", "remove", "--force", wt.path], {
            cwd: wt.repoDir, timeout: 15_000,
          }).catch(() => {});
          await execFileP("git", ["worktree", "prune"], {
            cwd: wt.repoDir, timeout: 10_000,
          }).catch(() => {});
        }
        if (wt.path && fs.existsSync(wt.path)) {
          fs.rmSync(wt.path, { recursive: true, force: true });
        }
      }
      removeWorktree(id);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.post("/api/config/cleanup-board", async (req, res) => {
    const { originRepo } = req.body ?? {};
    if (!originRepo) return sendError(res, 400, "originRepo obrigatório");

    const worktrees = getWorktrees().filter((w) => w.repo === originRepo);
    const dirsToDelete = new Set();

    let repoDir = worktrees[0]?.repoDir ?? null;
    if (!repoDir) {
      const { projectsPath } = getConfig();
      const repoName = originRepo.split("/")[1];
      if (repoName) repoDir = path.join(projectsPath, repoName);
    }
    if (repoDir) dirsToDelete.add(repoDir);

    for (const wt of worktrees) {
      if (wt.path)    dirsToDelete.add(wt.path);
      if (wt.repoDir) dirsToDelete.add(wt.repoDir);
    }

    setConfig({ worktrees: getWorktrees().filter((w) => w.repo !== originRepo) });

    const sorted = [...dirsToDelete].sort((a, b) => b.length - a.length);
    for (const dir of sorted) {
      if (!fs.existsSync(dir)) continue;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {
        // On Windows, locked files can resist rmSync — try via PowerShell as fallback
        if (process.platform === "win32") {
          await execFileP(
            "powershell",
            ["-NoProfile", "-Command", `Remove-Item -Recurse -Force -LiteralPath '${dir}'`],
            { timeout: 20_000 },
          ).catch(() => {});
        }
      }
    }

    res.json({ ok: true });
  });
}
