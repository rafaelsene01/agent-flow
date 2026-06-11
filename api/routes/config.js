import fs from "fs";
import os from "os";
import path from "path";
import { execSync, execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileP = promisify(execFile);
import { getConfig, setConfig, getWorktrees, removeWorktree, updateWorktreeStatus } from "../modules/config/config.service.js";

const BROWSE_CMD = {
  win32:  `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"`,
  darwin: `osascript -e 'POSIX path of (choose folder)'`,
  linux:  `zenity --file-selection --directory 2>/dev/null || kdialog --getexistingdirectory 2>/dev/null`,
};

const LOGS_DIR = path.join(os.homedir(), ".agent-flow", "logs");

// Log stream that writes to the worktree (deleted on cleanup) AND to a
// persistent copy in ~/.agent-flow/logs/<worktree>-<name>, so the run log
// survives worktree removal and can be inspected after a failure.
function createRunLog(wt, name) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const persistPath = path.join(LOGS_DIR, `${path.basename(wt.path)}-${name}`);
  const streams = [
    fs.createWriteStream(path.join(wt.path, name), { flags: "w", encoding: "utf-8" }),
    fs.createWriteStream(persistPath, { flags: "w", encoding: "utf-8" }),
  ];
  return {
    persistPath,
    write(chunk) { for (const s of streams) s.write(chunk); },
    end(cb) {
      let pending = streams.length;
      for (const s of streams) s.end(() => { if (--pending === 0) cb?.(); });
    },
  };
}

// lastError with the tail of Claude's output, so the real cause (usage limit,
// crash, refusal) is visible in the UI even after the worktree log is gone.
function failureDetail(result, persistPath) {
  const reason = result.error ?? (result.signal ? `signal ${result.signal}` : `exit code ${result.code}`);
  const tail = result.output.trim().slice(-500);
  const log = persistPath ? `\n(log completo: ${persistPath})` : "";
  return tail ? `${reason}\n--- final do output ---\n${tail}${log}` : `${reason}${log}`;
}

export default function configRoutes(app) {
  app.get("/api/config", (_req, res) => {
    res.json(getConfig());
  });

  app.post("/api/config", (req, res) => {
    try {
      const updated = setConfig(req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/config/worktrees", (_req, res) => {
    res.json(getWorktrees());
  });

  app.delete("/api/config/worktrees/:id", async (req, res) => {
    const id = decodeURIComponent(req.params.id);
    try {
      const wt = getWorktrees().find((w) => w.id === id);
      if (wt) {
        // Remove git worktree registration + directory
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
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/config/worktrees/:id/spec", (req, res) => {
    try {
      const id = decodeURIComponent(req.params.id);
      const { title, number, body } = req.body;

      const wt = getWorktrees().find((w) => w.id === id);
      if (!wt) return res.status(404).json({ error: "Worktree não encontrado na configuração." });
      if (!fs.existsSync(wt.path)) {
        return res.status(400).json({ error: `Diretório não encontrado: ${wt.path}` });
      }

      const lines = [
        `# ${title ?? "Card"}`,
        "",
        number != null ? `**Card:** #${number}` : null,
        `**Branch:** \`${wt.branch}\``,
        "",
        "---",
        "",
        body?.trim() || "_Sem descrição._",
      ].filter((l) => l !== null);

      const filePath = path.join(wt.path, "CARD.md");
      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
      res.json({ ok: true, filePath });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/config/worktrees/:id/run", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { title, number, body } = req.body;

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                      return res.status(404).json({ error: "Worktree não encontrado na configuração." });
    if (!fs.existsSync(wt.path))  return res.status(400).json({ error: `Diretório não encontrado: ${wt.path}` });

    // ── 1. Criar CARD.md ──────────────────────────────────────────────────────
    const lines = [
      `# ${title ?? "Card"}`,
      "",
      number != null ? `**Card:** #${number}` : null,
      `**Branch:** \`${wt.branch}\``,
      "",
      "---",
      "",
      body?.trim() || "_Sem descrição._",
    ].filter((l) => l !== null);

    try {
      fs.writeFileSync(path.join(wt.path, "CARD.md"), lines.join("\n"), "utf-8");
    } catch (err) {
      return res.status(500).json({ error: `Erro ao criar CARD.md: ${err.message}` });
    }

    // ── 2. Marcar como running e responder imediatamente ──────────────────────
    updateWorktreeStatus(id, {
      status:          "running",
      lastRunAt:       new Date().toISOString(),
      lastError:       null,
      cleanupDone:     false,
      commitPushStatus: null,
      pendingCommitMsg: null,
    });
    res.json({ ok: true });

    // ── 3. Pipeline em background: implementar → commit → done ───────────────
    const logStream = createRunLog(wt, "agent-flow.log");
    const isWin     = process.platform === "win32";

    // Pipe prompt via stdin (no -p flag) so Claude enters the full agentic loop.
    // stdin is closed immediately after writing so Claude processes and exits.
    function runClaude(prompt) {
      return new Promise((resolve) => {
        let output = "";
        const child = spawn(
          "claude",
          ["--dangerously-skip-permissions"],
          { cwd: wt.path, shell: isWin, stdio: ["pipe", "pipe", "pipe"] },
        );
        child.stdout.on("data", (d) => { const t = d.toString(); logStream.write(t); output += t; });
        child.stderr.on("data", (d) => { const t = d.toString(); logStream.write(t); output += t; });
        child.on("error",  (err)          => resolve({ code: 1, output, error: err.message }));
        child.on("close",  (code, signal) => resolve({ code, signal, output }));
        // Write prompt then close stdin — EOF signals Claude to process and exit.
        child.stdin.end(prompt, "utf-8");
      });
    }

    (async () => {
      const INTERNAL = ["CARD.md", "agent-flow.log", "tlc.log", "tlc-exec.log"];

      // ── step 1: record HEAD before Claude touches anything ─────────────────
      const { stdout: headBefore } = await execFileP(
        "git", ["rev-parse", "HEAD"], { cwd: wt.path, timeout: 5_000 },
      ).catch(() => ({ stdout: "" }));
      const initialHead = headBefore.trim();

      // ── step 2: implement task ─────────────────────────────────────────────
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
      );

      if (impl.code !== 0) {
        logStream.end();
        updateWorktreeStatus(id, { status: "error", lastError: `Implementation failed: ${failureDetail(impl, logStream.persistPath)}` });
        return;
      }

      // ── step 3: squash any intermediate commits Claude made ────────────────
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

      // ── step 4: verify Claude changed something beyond internal files ───────
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

      // ── step 5: fechar log ────────────────────────────────────────────────
      await new Promise((resolve) => logStream.end(resolve));

      updateWorktreeStatus(id, { status: "done" });
    })();
  });

  app.post("/api/config/worktrees/:id/run-tlc", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { title, number, body } = req.body;

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                      return res.status(404).json({ error: "Worktree não encontrado na configuração." });
    if (!fs.existsSync(wt.path))  return res.status(400).json({ error: `Diretório não encontrado: ${wt.path}` });

    // ── 1. Criar CARD.md ──────────────────────────────────────────────────────
    const lines = [
      `# ${title ?? "Card"}`,
      "",
      number != null ? `**Card:** #${number}` : null,
      `**Branch:** \`${wt.branch}\``,
      "",
      "---",
      "",
      body?.trim() || "_Sem descrição._",
    ].filter((l) => l !== null);

    try {
      fs.writeFileSync(path.join(wt.path, "CARD.md"), lines.join("\n"), "utf-8");
    } catch (err) {
      return res.status(500).json({ error: `Erro ao criar CARD.md: ${err.message}` });
    }

    // ── 2. Marcar como running e responder imediatamente ──────────────────────
    updateWorktreeStatus(id, {
      tlcStatus:    "running",
      tlcLastRunAt: new Date().toISOString(),
      tlcLastError: null,
    });
    res.json({ ok: true });

    // ── 3. Pipeline em background: criar spec, design e tasks ─────────────────
    const logStream = createRunLog(wt, "tlc.log");
    const isWin     = process.platform === "win32";

    function runClaude(prompt) {
      return new Promise((resolve) => {
        let output = "";
        const child = spawn(
          "claude",
          ["--dangerously-skip-permissions"],
          { cwd: wt.path, shell: isWin, stdio: ["pipe", "pipe", "pipe"] },
        );
        child.stdout.on("data", (d) => { const t = d.toString(); logStream.write(t); output += t; });
        child.stderr.on("data", (d) => { const t = d.toString(); logStream.write(t); output += t; });
        child.on("error",  (err)          => resolve({ code: 1, output, error: err.message }));
        child.on("close",  (code, signal) => resolve({ code, signal, output }));
        child.stdin.end(prompt, "utf-8");
      });
    }

    (async () => {
      logStream.write("=== TLC: Criando spec, design e tasks ===\n");

      const cardContent = fs.readFileSync(path.join(wt.path, "CARD.md"), "utf-8");

      const result = await runClaude(
        "/tlc-spec-driven\n\n" +
        "Leia o conteúdo abaixo e execute as fases Specify, Design e Tasks completas.\n\n" +
        cardContent,
      );

      if (result.code !== 0) {
        logStream.end();
        updateWorktreeStatus(id, { tlcStatus: "error", tlcLastError: `TLC failed: ${failureDetail(result, logStream.persistPath)}` });
        return;
      }

      fs.rmSync(path.join(wt.path, "CARD.md"), { force: true });
      logStream.end();

      // Discover which files TLC created inside .specs/features/
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

  // ── TLC file read / write ─────────────────────────────────────────────────────

  // Scans .specs/features/ in the worktree and returns the feature path + which files exist.
  function scanTlcFeatures(worktreePath) {
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

  // Live scan — always reads disk, updates stored config, returns result.
  app.get("/api/config/worktrees/:id/tlc-scan", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                 return res.status(404).json({ error: "Worktree não encontrado" });
    if (!fs.existsSync(wt.path)) return res.status(400).json({ error: `Diretório não encontrado: ${wt.path}` });

    const result = scanTlcFeatures(wt.path);
    if (!result) return res.json({ tlcFeaturePath: null, tlcFiles: { spec: false, design: false, tasks: false } });

    updateWorktreeStatus(id, { tlcFeaturePath: result.tlcFeaturePath, tlcFiles: result.tlcFiles });
    res.json(result);
  });

  app.get("/api/config/worktrees/:id/tlc-file/:type", (req, res) => {
    const id   = decodeURIComponent(req.params.id);
    const type = req.params.type;
    if (!["spec", "design", "tasks"].includes(type)) return res.status(400).json({ error: "Tipo inválido" });

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return res.status(404).json({ error: "Worktree não encontrado" });

    // Use stored path, or fall back to a live scan if not set yet.
    let featurePath = wt.tlcFeaturePath;
    if (!featurePath || !fs.existsSync(featurePath)) {
      const scanned = scanTlcFeatures(wt.path);
      if (!scanned) return res.status(404).json({ error: "Nenhum feature TLC encontrado na worktree" });
      featurePath = scanned.tlcFeaturePath;
      updateWorktreeStatus(id, { tlcFeaturePath: scanned.tlcFeaturePath, tlcFiles: scanned.tlcFiles });
    }

    const filePath = path.join(featurePath, `${type}.md`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: `${type}.md não encontrado` });

    res.json({ content: fs.readFileSync(filePath, "utf-8"), filePath });
  });

  app.put("/api/config/worktrees/:id/tlc-file/:type", (req, res) => {
    const id      = decodeURIComponent(req.params.id);
    const type    = req.params.type;
    const { content } = req.body;
    if (!["spec", "design", "tasks"].includes(type)) return res.status(400).json({ error: "Tipo inválido" });
    if (typeof content !== "string") return res.status(400).json({ error: "Conteúdo inválido" });

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return res.status(404).json({ error: "Worktree não encontrado" });

    let featurePath = wt.tlcFeaturePath;
    if (!featurePath || !fs.existsSync(featurePath)) {
      const scanned = scanTlcFeatures(wt.path);
      if (!scanned) return res.status(404).json({ error: "Nenhum feature TLC encontrado na worktree" });
      featurePath = scanned.tlcFeaturePath;
      updateWorktreeStatus(id, { tlcFeaturePath: scanned.tlcFeaturePath, tlcFiles: scanned.tlcFiles });
    }

    const filePath = path.join(featurePath, `${type}.md`);
    try {
      fs.writeFileSync(filePath, content, "utf-8");
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/config/worktrees/:id/run-tlc-exec", (req, res) => {
    const id = decodeURIComponent(req.params.id);

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                     return res.status(404).json({ error: "Worktree não encontrado na configuração." });
    if (!fs.existsSync(wt.path)) return res.status(400).json({ error: `Diretório não encontrado: ${wt.path}` });

    // Resolve feature path (stored or live scan)
    let featurePath = wt.tlcFeaturePath;
    if (!featurePath || !fs.existsSync(featurePath)) {
      const scanned = scanTlcFeatures(wt.path);
      if (!scanned) return res.status(400).json({ error: "Nenhum feature TLC encontrado na worktree." });
      featurePath = scanned.tlcFeaturePath;
      updateWorktreeStatus(id, { tlcFeaturePath: featurePath, tlcFiles: scanned.tlcFiles });
    }

    // Relative path for the Claude prompt (forward slashes)
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
    const isWin     = process.platform === "win32";

    function runClaude(prompt) {
      return new Promise((resolve) => {
        let output = "";
        const child = spawn(
          "claude",
          ["--dangerously-skip-permissions"],
          { cwd: wt.path, shell: isWin, stdio: ["pipe", "pipe", "pipe"] },
        );
        child.stdout.on("data", (d) => { const t = d.toString(); logStream.write(t); output += t; });
        child.stderr.on("data", (d) => { const t = d.toString(); logStream.write(t); output += t; });
        child.on("error",  (err)          => resolve({ code: 1, output, error: err.message }));
        child.on("close",  (code, signal) => resolve({ code, signal, output }));
        child.stdin.end(prompt, "utf-8");
      });
    }

    (async () => {
      const INTERNAL = ["CARD.md", "agent-flow.log", "tlc.log", "tlc-exec.log"];

      // ── step 1: record HEAD before Claude touches anything ─────────────────
      const { stdout: headBefore } = await execFileP(
        "git", ["rev-parse", "HEAD"], { cwd: wt.path, timeout: 5_000 },
      ).catch(() => ({ stdout: "" }));
      const initialHead = headBefore.trim();

      // ── step 2: execute spec via Claude ────────────────────────────────────
      logStream.write("=== Step 1: executando spec ===\n");

      const impl = await runClaude(
        `Execute a spec em ${featureRelPath}/spec.md usando o máximo de subagentes possível. Não faça commits nem push.\n` +
        "Quando totalmente concluído, sua ÚLTIMA linha deve ser exatamente: COMMIT: <mensagem conventional commit>\n" +
        "(ex: COMMIT: feat: implement card sorting)",
      );

      if (impl.code !== 0) {
        logStream.end();
        updateWorktreeStatus(id, { tlcExecStatus: "error", tlcExecLastError: `Execução falhou: ${failureDetail(impl, logStream.persistPath)}` });
        return;
      }

      // ── step 3: squash any intermediate commits Claude made ────────────────
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

      // ── step 4: fechar log ────────────────────────────────────────────────
      await new Promise((resolve) => logStream.end(resolve));

      updateWorktreeStatus(id, { tlcExecStatus: "done" });
    })();
  });

  // ── Limpar arquivos internos ──────────────────────────────────────────────────

  app.post("/api/config/worktrees/:id/cleanup", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                     return res.status(404).json({ error: "Worktree não encontrado na configuração." });
    if (!fs.existsSync(wt.path)) return res.status(400).json({ error: `Diretório não encontrado: ${wt.path}` });

    const files = ["CARD.md", "agent-flow.log", "tlc.log", "tlc-exec.log"];
    for (const f of files) {
      try { fs.rmSync(path.join(wt.path, f), { force: true }); } catch (_) {}
    }
    try { fs.rmSync(path.join(wt.path, ".specs"), { recursive: true, force: true }); } catch (_) {}

    updateWorktreeStatus(id, { cleanupDone: true, commitPushStatus: null });
    res.json({ ok: true });
  });

  // ── Commit & Push ─────────────────────────────────────────────────────────────

  app.post("/api/config/worktrees/:id/commit-push", (req, res) => {
    const id = decodeURIComponent(req.params.id);

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)                     return res.status(404).json({ error: "Worktree não encontrado na configuração." });
    if (!fs.existsSync(wt.path)) return res.status(400).json({ error: `Diretório não encontrado: ${wt.path}` });

    updateWorktreeStatus(id, {
      commitPushStatus:    "running",
      commitPushLastRunAt: new Date().toISOString(),
      commitPushLastError: null,
    });
    res.json({ ok: true });

    (async () => {
      // ── step 1: git add -A ────────────────────────────────────────────────
      try {
        await execFileP("git", ["add", "-A"], { cwd: wt.path, timeout: 30_000 });
      } catch (err) {
        updateWorktreeStatus(id, { commitPushStatus: "error", commitPushLastError: `git add falhou: ${err.message}` });
        return;
      }

      // ── step 2: commitar apenas se houver alterações pendentes ──────────────
      const { stdout: statusOut } = await execFileP(
        "git", ["status", "--porcelain"], { cwd: wt.path, timeout: 10_000 },
      ).catch(() => ({ stdout: "" }));

      if (statusOut.trim()) {
        const commitMsg = "chore: wip [agent-flow]";
        try {
          await execFileP("git", ["commit", "--no-verify", "-m", commitMsg], { cwd: wt.path, timeout: 30_000 });
        } catch (err) {
          updateWorktreeStatus(id, { commitPushStatus: "error", commitPushLastError: `git commit falhou: ${err.message}` });
          return;
        }
      }

      // ── step 5: push ──────────────────────────────────────────────────────
      try {
        await execFileP("git", ["push", "--no-verify"], { cwd: wt.path, timeout: 60_000 });
      } catch (err) {
        updateWorktreeStatus(id, { commitPushStatus: "error", commitPushLastError: `Push falhou: ${err.message}` });
        return;
      }

      updateWorktreeStatus(id, { commitPushStatus: "done" });
    })();
  });

  app.post("/api/config/cleanup-board", async (req, res) => {
    const { originRepo } = req.body;
    if (!originRepo) return res.status(400).json({ error: "originRepo obrigatório" });

    const worktrees = getWorktrees().filter((w) => w.repo === originRepo);

    // Collect all dirs to delete before touching config
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

    // 1. Remove from config immediately
    setConfig({ worktrees: getWorktrees().filter((w) => w.repo !== originRepo) });

    // 2. Delete all directories — worktrees first, repo last
    const sorted = [...dirsToDelete].sort((a, b) => b.length - a.length); // deepest first
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

  app.post("/api/config/browse", (_req, res) => {
    const cmd = BROWSE_CMD[process.platform];
    if (!cmd) return res.status(400).json({ error: "Plataforma não suportada" });
    try {
      const selected = execSync(cmd, { encoding: "utf-8", timeout: 30000 }).trim();
      if (!selected) return res.status(204).end();
      res.json({ path: selected });
    } catch {
      res.status(204).end();
    }
  });
}
