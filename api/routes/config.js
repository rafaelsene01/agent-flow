import fs from "fs";
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

  app.delete("/api/config/worktrees/:id", (req, res) => {
    try {
      removeWorktree(decodeURIComponent(req.params.id));
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
      status:     "running",
      lastRunAt:  new Date().toISOString(),
      lastError:  null,
    });
    res.json({ ok: true });

    // ── 3. Pipeline em background: implementar → commit → done ───────────────
    const logPath   = path.join(wt.path, "agent-flow.log");
    const logStream = fs.createWriteStream(logPath, { flags: "w", encoding: "utf-8" });
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
        child.stderr.on("data", (d) => logStream.write(d));
        child.on("error",  (err)          => resolve({ code: 1, output, error: err.message }));
        child.on("close",  (code, signal) => resolve({ code, signal, output }));
        // Write prompt then close stdin — EOF signals Claude to process and exit.
        child.stdin.end(prompt, "utf-8");
      });
    }

    (async () => {
      // ── step 1: implement task ─────────────────────────────────────────────
      logStream.write("=== Step 1: implementing task ===\n");

      // Embed CARD.md content directly so Claude has full context without needing
      // to ask what to do with the file.
      const cardContent = fs.readFileSync(path.join(wt.path, "CARD.md"), "utf-8");

      const impl = await runClaude(
        "You are an autonomous coding agent. Implement the task below immediately.\n" +
        "Rules:\n" +
        "- Use Write and Edit tools to create/modify files. Do NOT describe — just do it.\n" +
        "- Do NOT ask questions or wait for confirmation.\n" +
        "- Do NOT run any git commands.\n\n" +
        "TASK:\n" +
        cardContent,
      );

      if (impl.code !== 0) {
        logStream.end();
        const detail = impl.error ?? (impl.signal ? `signal ${impl.signal}` : `exit code ${impl.code}`);
        updateWorktreeStatus(id, { status: "error", lastError: `Implementation failed: ${detail}` });
        return;
      }

      // Verify Claude actually changed files (CARD.md alone doesn't count)
      const { stdout: changesOut } = await execFileP(
        "git", ["status", "--porcelain"], { cwd: wt.path, timeout: 10_000 },
      ).catch(() => ({ stdout: "" }));

      const realChanges = changesOut.trim().split("\n")
        .filter((l) => l.trim() && !l.endsWith("CARD.md"));

      if (realChanges.length === 0) {
        logStream.end();
        updateWorktreeStatus(id, { status: "error", lastError: "Implementation failed: no files were changed by Claude" });
        return;
      }

      // ── step 2: semantic commit (we run git, Claude only writes the message) ─
      logStream.write("\n=== Step 2: semantic commit ===\n");

      // Remove internal files before staging so they never appear in the commit.
      for (const f of ["CARD.md", "agent-flow.log"]) {
        fs.rmSync(path.join(wt.path, f), { force: true });
      }

      try {
        await execFileP("git", ["add", "-A"], { cwd: wt.path, timeout: 30_000 });
      } catch (err) {
        logStream.end();
        updateWorktreeStatus(id, { status: "error", lastError: `git add failed: ${err.message}` });
        return;
      }

      // Skip commit if nothing was staged after excluding CARD.md
      const { stdout: statusOut } = await execFileP(
        "git", ["status", "--porcelain"], { cwd: wt.path, timeout: 10_000 },
      ).catch(() => ({ stdout: "" }));

      if (statusOut.trim()) {
        // Ask Claude only for the commit message text — no git tool calls
        const { stdout: diffStat } = await execFileP(
          "git", ["diff", "--cached", "--stat"], { cwd: wt.path, timeout: 10_000 },
        ).catch(() => ({ stdout: "" }));

        logStream.write("Generating commit message…\n");
        const msgResult = await runClaude(
          "Output ONLY a single-line semantic commit message following Conventional Commits " +
          "(feat/fix/refactor/docs/chore/style/test/etc). No explanation, no markdown, no quotes. " +
          "Changes:\n\n" + diffStat,
        );

        const commitMsg = msgResult.output
          .split("\n").map((l) => l.trim()).filter(Boolean).pop()
          || "feat: implement task from CARD.md";

        logStream.write(`Committing: ${commitMsg}\n`);
        try {
          await execFileP("git", ["commit", "-m", commitMsg], { cwd: wt.path, timeout: 30_000 });
        } catch (err) {
          logStream.end();
          updateWorktreeStatus(id, { status: "error", lastError: `git commit failed: ${err.message}` });
          return;
        }
      } else {
        logStream.write("Nothing to commit — skipping.\n");
      }

      // ── step 3: push ───────────────────────────────────────────────────────
      logStream.write("\n=== Step 3: git push ===\n");
      try {
        const { stdout, stderr } = await execFileP("git", ["push"], { cwd: wt.path, timeout: 60_000 });
        if (stdout) logStream.write(stdout);
        if (stderr) logStream.write(stderr);
      } catch (err) {
        logStream.end();
        updateWorktreeStatus(id, { status: "error", lastError: `Push failed: ${err.message}` });
        return;
      }

      logStream.end();
      updateWorktreeStatus(id, { status: "done" });
    })();
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
