import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { runClaude, createRunLog, failureDetail } from "../../modules/claude/claude.runner.js";
import { getWorktrees, updateWorktreeStatus } from "../../modules/config/config.service.js";
import { sendError } from "../../lib/errors.js";
import { scanTlcFeatures } from "./tlc.js";

const execFileP  = promisify(execFile);
const INTERNAL   = ["CARD.md", "agent-flow.log", "tlc.log", "tlc-exec.log"];

function buildCardLines({ title, number, body, branch }) {
  return [
    `# ${title ?? "Card"}`,
    "",
    number != null ? `**Card:** #${number}` : null,
    `**Branch:** \`${branch}\``,
    "",
    "---",
    "",
    body?.trim() || "_Sem descrição._",
  ].filter((l) => l !== null);
}

export default function runnerRoutes(app) {
  app.post("/api/config/worktrees/:id/spec", (req, res) => {
    try {
      const id = decodeURIComponent(req.params.id);
      const { title, number, body } = req.body ?? {};

      const wt = getWorktrees().find((w) => w.id === id);
      if (!wt)                     return sendError(res, 404, "Worktree não encontrado na configuração.");
      if (!fs.existsSync(wt.path)) return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

      const filePath = path.join(wt.path, "CARD.md");
      fs.writeFileSync(filePath, buildCardLines({ title, number, body, branch: wt.branch }).join("\n"), "utf-8");
      res.json({ ok: true, filePath });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.post("/api/config/worktrees/:id/run", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { title, number, body } = req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                     return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path)) return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    try {
      fs.writeFileSync(path.join(wt.path, "CARD.md"), buildCardLines({ title, number, body, branch: wt.branch }).join("\n"), "utf-8");
    } catch (err) {
      return sendError(res, 500, `Erro ao criar CARD.md: ${err.message}`, err);
    }

    updateWorktreeStatus(id, {
      status:           "running",
      lastRunAt:        new Date().toISOString(),
      lastError:        null,
      cleanupDone:      false,
      commitPushStatus: null,
      pendingCommitMsg: null,
    });
    res.json({ ok: true });

    const logStream = createRunLog(wt, "agent-flow.log");

    (async () => {
      const { stdout: headBefore } = await execFileP(
        "git", ["rev-parse", "HEAD"], { cwd: wt.path, timeout: 5_000 },
      ).catch(() => ({ stdout: "" }));
      const initialHead = headBefore.trim();

      logStream.write("=== Step 1: implementing task ===\n");
      const cardContent = fs.readFileSync(path.join(wt.path, "CARD.md"), "utf-8");

      const impl = await runClaude(
        "You are an autonomous coding agent. Implement the task below immediately.\n" +
        "Rules:\n" +
        "- Use Write and Edit tools to create/modify files. Do NOT describe — just do it.\n" +
        "- Do NOT ask questions or wait for confirmation.\n" +
        "- Do NOT run any git commands.\n" +
        "- When fully done, output as your LAST line exactly: COMMIT: <conventional commit message>\n" +
        "  (e.g. COMMIT: feat: add user auth endpoint)\n\n" +
        "TASK:\n" +
        cardContent,
        wt.path,
        logStream,
      );

      if (impl.code !== 0) {
        logStream.end();
        updateWorktreeStatus(id, { status: "error", lastError: `Implementation failed: ${failureDetail(impl, logStream.persistPath)}` });
        return;
      }

      if (initialHead) {
        const { stdout: countOut } = await execFileP(
          "git", ["rev-list", "--count", `${initialHead}..HEAD`], { cwd: wt.path, timeout: 5_000 },
        ).catch(() => ({ stdout: "0" }));
        const claudeCommits = parseInt(countOut.trim(), 10) || 0;
        if (claudeCommits > 0) {
          logStream.write(`\n=== Step 2: squashing ${claudeCommits} commit(s) from Claude ===\n`);
          await execFileP("git", ["reset", "--soft", `HEAD~${claudeCommits}`], { cwd: wt.path, timeout: 15_000 })
            .catch((e) => logStream.write(`Warning: reset failed: ${e.message}\n`));
        }
      }

      const { stdout: changesOut } = await execFileP(
        "git", ["status", "--porcelain"], { cwd: wt.path, timeout: 10_000 },
      ).catch(() => ({ stdout: "" }));
      const realChanges = changesOut.trim().split("\n").filter((l) => {
        if (!l.trim()) return false;
        const file = l.slice(3).trim();
        return !INTERNAL.includes(file) && !file.startsWith(".specs/");
      });

      if (realChanges.length === 0) {
        logStream.end();
        updateWorktreeStatus(id, { status: "error", lastError: `Implementation failed: no files were changed by Claude\n(log completo: ${logStream.persistPath})` });
        return;
      }

      await new Promise((resolve) => logStream.end(resolve));
      updateWorktreeStatus(id, { status: "done" });
    })();
  });

  app.post("/api/config/worktrees/:id/run-tlc", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { title, number, body } = req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                     return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path)) return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    try {
      fs.writeFileSync(path.join(wt.path, "CARD.md"), buildCardLines({ title, number, body, branch: wt.branch }).join("\n"), "utf-8");
    } catch (err) {
      return sendError(res, 500, `Erro ao criar CARD.md: ${err.message}`, err);
    }

    updateWorktreeStatus(id, {
      tlcStatus:    "running",
      tlcLastRunAt: new Date().toISOString(),
      tlcLastError: null,
    });
    res.json({ ok: true });

    const logStream = createRunLog(wt, "tlc.log");

    (async () => {
      logStream.write("=== TLC: Criando spec, design e tasks ===\n");
      const cardContent = fs.readFileSync(path.join(wt.path, "CARD.md"), "utf-8");

      const result = await runClaude(
        "/tlc-spec-driven\n\n" +
        "Leia o conteúdo abaixo e execute as fases Specify, Design e Tasks completas.\n\n" +
        cardContent,
        wt.path,
        logStream,
      );

      if (result.code !== 0) {
        logStream.end();
        updateWorktreeStatus(id, { tlcStatus: "error", tlcLastError: `TLC failed: ${failureDetail(result, logStream.persistPath)}` });
        return;
      }

      fs.rmSync(path.join(wt.path, "CARD.md"), { force: true });
      logStream.end();

      const featuresDir = path.join(wt.path, ".specs", "features");
      let tlcFeaturePath = null;
      const tlcFiles = { spec: false, design: false, tasks: false };

      if (fs.existsSync(featuresDir)) {
        const dirs = fs.readdirSync(featuresDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => ({ name: d.name, mtime: fs.statSync(path.join(featuresDir, d.name)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);

        if (dirs.length > 0) {
          tlcFeaturePath = path.join(featuresDir, dirs[0].name);
          for (const type of ["spec", "design", "tasks"]) {
            tlcFiles[type] = fs.existsSync(path.join(tlcFeaturePath, `${type}.md`));
          }
        }
      }

      updateWorktreeStatus(id, { tlcStatus: "done", tlcFeaturePath, tlcFiles });
    })();
  });

  app.post("/api/config/worktrees/:id/run-tlc-exec", (req, res) => {
    const id = decodeURIComponent(req.params.id);

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                     return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path)) return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    let featurePath = wt.tlcFeaturePath;
    if (!featurePath || !fs.existsSync(featurePath)) {
      const scanned = scanTlcFeatures(wt.path);
      if (!scanned) return sendError(res, 400, "Nenhum feature TLC encontrado na worktree.");
      featurePath = scanned.tlcFeaturePath;
      updateWorktreeStatus(id, { tlcFeaturePath: featurePath, tlcFiles: scanned.tlcFiles });
    }

    const featureRelPath = path.relative(wt.path, featurePath).replace(/\\/g, "/");

    updateWorktreeStatus(id, {
      tlcExecStatus:    "running",
      tlcExecLastRunAt: new Date().toISOString(),
      tlcExecLastError: null,
      cleanupDone:      false,
      commitPushStatus: null,
      pendingCommitMsg: null,
    });
    res.json({ ok: true });

    const logStream = createRunLog(wt, "tlc-exec.log");

    (async () => {
      const { stdout: headBefore } = await execFileP(
        "git", ["rev-parse", "HEAD"], { cwd: wt.path, timeout: 5_000 },
      ).catch(() => ({ stdout: "" }));
      const initialHead = headBefore.trim();

      logStream.write("=== Step 1: executando spec ===\n");

      const impl = await runClaude(
        `Execute a spec em ${featureRelPath}/spec.md usando o máximo de subagentes possível. Não faça commits nem push.\n` +
        "Quando totalmente concluído, sua ÚLTIMA linha deve ser exatamente: COMMIT: <mensagem conventional commit>\n" +
        "(ex: COMMIT: feat: implement card sorting)",
        wt.path,
        logStream,
      );

      if (impl.code !== 0) {
        logStream.end();
        updateWorktreeStatus(id, { tlcExecStatus: "error", tlcExecLastError: `Execução falhou: ${failureDetail(impl, logStream.persistPath)}` });
        return;
      }

      if (initialHead) {
        const { stdout: countOut } = await execFileP(
          "git", ["rev-list", "--count", `${initialHead}..HEAD`], { cwd: wt.path, timeout: 5_000 },
        ).catch(() => ({ stdout: "0" }));
        const claudeCommits = parseInt(countOut.trim(), 10) || 0;
        if (claudeCommits > 0) {
          logStream.write(`\n=== Step 2: squashing ${claudeCommits} commit(s) intermediários ===\n`);
          await execFileP("git", ["reset", "--soft", `HEAD~${claudeCommits}`], { cwd: wt.path, timeout: 15_000 })
            .catch((e) => logStream.write(`Warning: reset failed: ${e.message}\n`));
        }
      }

      await new Promise((resolve) => logStream.end(resolve));
      updateWorktreeStatus(id, { tlcExecStatus: "done" });
    })();
  });

  app.post("/api/config/worktrees/:id/cleanup", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                     return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path)) return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    for (const f of INTERNAL) {
      try { fs.rmSync(path.join(wt.path, f), { force: true }); } catch (_) {}
    }
    try { fs.rmSync(path.join(wt.path, ".specs"), { recursive: true, force: true }); } catch (_) {}

    updateWorktreeStatus(id, { cleanupDone: true, commitPushStatus: null });
    res.json({ ok: true });
  });

  app.post("/api/config/worktrees/:id/commit-push", (req, res) => {
    const id = decodeURIComponent(req.params.id);

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                     return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path)) return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    updateWorktreeStatus(id, {
      commitPushStatus:    "running",
      commitPushLastRunAt: new Date().toISOString(),
      commitPushLastError: null,
    });
    res.json({ ok: true });

    (async () => {
      try {
        await execFileP("git", ["add", "-A"], { cwd: wt.path, timeout: 30_000 });
      } catch (err) {
        updateWorktreeStatus(id, { commitPushStatus: "error", commitPushLastError: `git add falhou: ${err.message}` });
        return;
      }

      const { stdout: statusOut } = await execFileP(
        "git", ["status", "--porcelain"], { cwd: wt.path, timeout: 10_000 },
      ).catch(() => ({ stdout: "" }));

      if (statusOut.trim()) {
        try {
          await execFileP("git", ["commit", "--no-verify", "-m", "chore: wip [agent-flow]"], { cwd: wt.path, timeout: 30_000 });
        } catch (err) {
          updateWorktreeStatus(id, { commitPushStatus: "error", commitPushLastError: `git commit falhou: ${err.message}` });
          return;
        }
      }

      try {
        await execFileP("git", ["push", "--no-verify"], { cwd: wt.path, timeout: 60_000 });
      } catch (err) {
        updateWorktreeStatus(id, { commitPushStatus: "error", commitPushLastError: `Push falhou: ${err.message}` });
        return;
      }

      updateWorktreeStatus(id, { commitPushStatus: "done" });
    })();
  });
}
