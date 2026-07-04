import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getConfig, setConfig, getWorktrees, removeWorktree, getHelpersDir, getOverlayDir } from "../../modules/config/config.service.js";
import { sendError } from "../../lib/errors.js";

const execFileP = promisify(execFile);

async function forceRemoveDir(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    if (process.platform !== "win32") throw err;
    // No Windows um processo rodando de dentro da worktree (ex.: next dev deixado
    // por um run) trava a exclusão. Mata esses processos e tenta de novo via PowerShell.
    const script = [
      `$dir = '${dir}'`,
      `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like "*$dir\\*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      `Start-Sleep -Milliseconds 500`,
      `Remove-Item -Recurse -Force -LiteralPath $dir -ErrorAction SilentlyContinue`,
    ].join("; ");
    await execFileP("powershell", ["-NoProfile", "-Command", script], { timeout: 30_000 }).catch(() => {});
    if (fs.existsSync(dir)) {
      throw new Error(`Não foi possível remover ${dir} — algum processo (terminal, editor, dev server) com o diretório de trabalho dentro da pasta ainda a mantém aberta. Feche-o e tente de novo.`);
    }
  }
}

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
        await forceRemoveDir(wt.path);
        await forceRemoveDir(wt.helpersDir ?? (wt.path + "-helpers"));
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
      const helpersDir = wt.helpersDir ?? (wt.path + "-helpers");
      if (helpersDir) dirsToDelete.add(helpersDir);
    }

    try {
      dirsToDelete.add(getOverlayDir(originRepo));
    } catch (_) {}

    setConfig({ worktrees: getWorktrees().filter((w) => w.repo !== originRepo) });

    const sorted = [...dirsToDelete].sort((a, b) => b.length - a.length);
    for (const dir of sorted) {
      await forceRemoveDir(dir).catch(() => {});
    }

    res.json({ ok: true });
  });
}
