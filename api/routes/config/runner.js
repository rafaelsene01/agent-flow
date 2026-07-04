import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  runClaude,
  resumeClaude,
  createRunLog,
  failureDetail,
  registerSseClient,
} from "../../modules/claude/claude.runner.js";
import {
  acquireSlot,
  releaseSlot,
  registerProcess,
  unregisterProcess,
} from "../../modules/claude/claude.concurrency.js";
import {
  getWorktrees,
  updateWorktreeStatus,
  getHelpersDir,
  getLanguage,
  appendChatSession,
  updateChatSession,
} from "../../modules/config/config.service.js";
import { sendError } from "../../lib/errors.js";

const execFileP = promisify(execFile);
const INTERNAL = [
  "CARD.md",
  "agent-flow.log",
  "tlc.log",
  "tlc-exec.log",
  "spec-eval.log",
];
const EXCLUDE_ENTRIES = [...INTERNAL, ".specs/"];

function makeSessionName(wt) {
  const worktreeName = path.basename(wt.path);
  const branchName = wt.branch ?? "main";
  return `${worktreeName}-${branchName}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function makeSessionId(wt, origin) {
  return `${makeSessionName(wt)}-${origin}-${Date.now().toString(36)}`;
}

function makeLogFile(origin) {
  return `${origin}-${Date.now().toString(36)}.log`;
}

function truncateDesc(text) {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= 200 ? t : t.slice(0, 199) + "…";
}

async function ensureWorktreeExclude(wtPath) {
  try {
    const { stdout } = await execFileP("git", ["rev-parse", "--git-dir"], {
      cwd: wtPath,
      timeout: 5_000,
    });
    const infoDir = path.join(stdout.trim(), "info");
    const excludeFile = path.join(infoDir, "exclude");
    fs.mkdirSync(infoDir, { recursive: true });
    const existing = fs.existsSync(excludeFile)
      ? fs.readFileSync(excludeFile, "utf8")
      : "";
    const toAdd = EXCLUDE_ENTRIES.filter((e) => !existing.includes(e));
    if (toAdd.length)
      fs.appendFileSync(excludeFile, "\n" + toAdd.join("\n") + "\n");
  } catch (_) {}
}

function langInstruction() {
  const lang = getLanguage();
  return lang === "pt"
    ? "Responda em português do Brasil.\n\n"
    : "Respond in English.\n\n";
}

export default function runnerRoutes(app) {
  app.post("/api/config/worktrees/:id/message", async (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { message, model, effort, sessionId } = req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)
      return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);
    if (!message?.trim()) return sendError(res, 400, "Mensagem obrigatória.");

    try {
      acquireSlot();
    } catch (err) {
      return sendError(res, err.status ?? 500, err.message);
    }

    let targetId, started, sessionLogFile;

    try {
      const sessions = wt.chatSessions ?? [];

      if (!sessionId) {
        sessionLogFile = makeLogFile("chat");
        targetId = makeSessionId(wt, "chat");
        await appendChatSession(id, {
          id: targetId,
          logFile: sessionLogFile,
          origin: "chat",
          description: truncateDesc(message),
          started: false,
          createdAt: new Date().toISOString(),
        });
        started = false;
      } else {
        const entry = sessions.find((s) => s.id === sessionId);
        if (!entry) {
          releaseSlot();
          return sendError(res, 400, "Sessão não encontrada.");
        }
        targetId = entry.id;
        started = entry.started;
        sessionLogFile = entry.logFile ?? makeLogFile("chat");
      }
    } catch (err) {
      releaseSlot();
      return sendError(res, 500, err.message, err);
    }

    updateWorktreeStatus(id, {
      messageStatus: "running",
      messageLastRunAt: new Date().toISOString(),
      messageLastError: null,
    });
    res.json({ ok: true, sessionId: targetId });

    const helpersLogPath = path.join(getHelpersDir(wt), sessionLogFile);
    const isResume = !!sessionId;
    const existingContent =
      isResume && fs.existsSync(helpersLogPath)
        ? fs.readFileSync(helpersLogPath, "utf-8")
        : "";
    const logStream = createRunLog(wt, sessionLogFile, {
      append: isResume,
      initialContent: existingContent,
    });

    (async () => {
      try {
        // Envia apenas o input do usuário, sem injetar nenhum outro prompt.
        const prompt = message.trim();
        const opts = { model: model || "sonnet", effort: effort || "medium" };
        logStream.write(
          `=== Mensagem do usuário (sessão ${targetId}${started ? ", resume" : ", nova"}) ===\n`,
        );

        const result = started
          ? await resumeClaude(
              prompt,
              wt.path,
              logStream,
              targetId,
              (child) => registerProcess(id, child),
              opts,
            )
          : await runClaude(
              prompt,
              wt.path,
              logStream,
              targetId,
              (child) => { registerProcess(id, child); updateChatSession(id, targetId, { started: true }); },
              opts,
            );

        if (result.code !== 0) {
          logStream.end();
          updateWorktreeStatus(id, {
            messageStatus: "error",
            messageLastError: `Mensagem falhou: ${failureDetail(result, logStream.persistPath)}`,
          });
          return;
        }

        await new Promise((resolve) => logStream.end(resolve));
        updateWorktreeStatus(id, { messageStatus: "done" });
        updateChatSession(id, targetId, { started: true });
      } finally {
        unregisterProcess(id);
        releaseSlot();
      }
    })();
  });

  app.post("/api/config/worktrees/:id/cleanup", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)
      return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    const cleanHelpersDir = getHelpersDir(wt);
    try {
      fs.rmSync(path.join(cleanHelpersDir, "CARD.md"), { force: true });
    } catch (_) {}
    // Backward compat: clean up from worktree too (old worktrees may still have files there)
    for (const f of INTERNAL) {
      try {
        fs.rmSync(path.join(wt.path, f), { force: true });
      } catch (_) {}
    }
    try {
      fs.rmSync(path.join(wt.path, ".specs"), { recursive: true, force: true });
    } catch (_) {}

    updateWorktreeStatus(id, { cleanupDone: true });
    res.json({ ok: true });
  });

  app.get("/api/config/worktrees/:id/changed-files", async (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);
    try {
      await ensureWorktreeExclude(wt.path);
      const { stdout } = await execFileP(
        "git",
        ["status", "--porcelain", "-uall"],
        { cwd: wt.path, timeout: 10_000 },
      );
      const files = stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const filePath = line.slice(3).trim();
          const fullPath = path.resolve(wt.path, filePath);
          const isDir =
            filePath.endsWith("/") ||
            (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory());
          return { status: line.slice(0, 2).trim(), path: filePath, isDir };
        });
      res.json({ files });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.get("/api/config/worktrees/:id/file-content", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");
    const filePath = req.query.file;
    if (!filePath) return sendError(res, 400, "file obrigatório");
    const wtResolved = path.resolve(wt.path);
    const fullPath = path.resolve(wt.path, filePath);
    if (!fullPath.startsWith(wtResolved + path.sep) && fullPath !== wtResolved)
      return sendError(res, 403, "Path não permitido");
    if (!fs.existsSync(fullPath)) return res.json({ content: null });
    try {
      const content = fs.readFileSync(fullPath, "utf8");
      res.json({ content });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.put("/api/config/worktrees/:id/file-content", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");
    const filePath = req.query.file;
    if (!filePath) return sendError(res, 400, "file obrigatório");
    const { content } = req.body ?? {};
    if (typeof content !== "string") return sendError(res, 400, "Conteúdo inválido");
    const wtResolved = path.resolve(wt.path);
    const fullPath = path.resolve(wt.path, filePath);
    if (!fullPath.startsWith(wtResolved + path.sep) && fullPath !== wtResolved)
      return sendError(res, 403, "Path não permitido");
    try {
      fs.writeFileSync(fullPath, content, "utf8");
      res.json({ ok: true });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.delete("/api/config/worktrees/:id/file", async (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);
    const filePath = req.query.file;
    if (!filePath) return sendError(res, 400, "file obrigatório");
    const wtResolved = path.resolve(wt.path);
    const fullPath = path.resolve(wt.path, filePath);
    if (!fullPath.startsWith(wtResolved + path.sep) && fullPath !== wtResolved)
      return sendError(res, 403, "Path não permitido");
    try {
      const { stdout: statusOut } = await execFileP(
        "git",
        ["status", "--porcelain", "-z", "--", filePath],
        { cwd: wt.path, timeout: 10_000 },
      );
      const statusLine = statusOut.split("\0")[0] ?? "";
      const x = statusLine[0] ?? " "; // index
      const y = statusLine[1] ?? " "; // worktree
      const isUntracked = x === "?" && y === "?";
      const isNewStaged = x === "A"; // staged new file, not in HEAD

      if (isUntracked) {
        if (fs.existsSync(fullPath))
          fs.rmSync(fullPath, { recursive: true, force: true });
      } else if (isNewStaged) {
        // Unstage then delete
        await execFileP("git", ["rm", "--cached", "--force", "--", filePath], {
          cwd: wt.path,
          timeout: 10_000,
        }).catch(() => {});
        if (fs.existsSync(fullPath))
          fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        // Modified, deleted, renamed — restore to HEAD (staged + worktree)
        await execFileP("git", ["checkout", "HEAD", "--", filePath], {
          cwd: wt.path,
          timeout: 10_000,
        });
      }
      res.json({ ok: true });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.get("/api/config/worktrees/:id/helpers-files", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");

    const helpersDir = getHelpersDir(wt);
    const files = [];

    if (fs.existsSync(path.join(helpersDir, "CARD.md"))) files.push("CARD.md");

    try {
      for (const entry of fs.readdirSync(helpersDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".log"))
          files.push(entry.name);
      }
    } catch (_) {}

    function collectMd(dir, relBase) {
      if (!fs.existsSync(dir)) return;
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
          if (entry.isDirectory()) collectMd(path.join(dir, entry.name), rel);
          else if (entry.isFile() && entry.name.endsWith(".md"))
            files.push(rel);
        }
      } catch (_) {}
    }
    collectMd(path.join(helpersDir, ".specs"), ".specs");

    res.json({ files });
  });

  app.get("/api/config/worktrees/:id/helpers-file", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");

    const filePath = req.query.file;
    if (!filePath) return sendError(res, 400, "file obrigatório");

    const helpersDir = getHelpersDir(wt);
    const resolved = path.resolve(helpersDir);
    const fullPath = path.resolve(helpersDir, filePath);

    if (!fullPath.startsWith(resolved + path.sep) && fullPath !== resolved)
      return sendError(res, 403, "Path não permitido");

    if (!fs.existsSync(fullPath)) return res.json({ content: null });

    try {
      res.json({ content: fs.readFileSync(fullPath, "utf8") });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.put("/api/config/worktrees/:id/helpers-file", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");
    const filePath = req.query.file;
    if (!filePath) return sendError(res, 400, "file obrigatório");
    const { content } = req.body ?? {};
    if (typeof content !== "string") return sendError(res, 400, "Conteúdo inválido");
    const helpersDir = getHelpersDir(wt);
    const resolved = path.resolve(helpersDir);
    const fullPath = path.resolve(helpersDir, filePath);
    if (!fullPath.startsWith(resolved + path.sep) && fullPath !== resolved)
      return sendError(res, 403, "Path não permitido");
    try {
      fs.writeFileSync(fullPath, content, "utf8");
      res.json({ ok: true });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.get("/api/config/worktrees/:id/log/stream", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    // Em dev o frontend (porta 3001) conecta direto aqui (porta 5522) para evitar
    // o buffering do proxy do next dev. Em produção é mesma origem.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    const cleanup = registerSseClient(id, res);
    req.on("close", cleanup);
  });

  app.get("/api/config/worktrees/:id/behind-count", async (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);
    try {
      await execFileP("git", ["fetch", "origin", wt.branch], {
        cwd: wt.path,
        timeout: 30_000,
      });
      const { stdout } = await execFileP(
        "git",
        ["rev-list", "--count", "HEAD..FETCH_HEAD"],
        { cwd: wt.path, timeout: 10_000 },
      );
      res.json({ behind: parseInt(stdout.trim(), 10) || 0 });
    } catch {
      res.json({ behind: 0 });
    }
  });

  app.post("/api/config/worktrees/:id/pull", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    updateWorktreeStatus(id, { pullStatus: "running", pullLastError: null });
    res.json({ ok: true });

    (async () => {
      const logStream = createRunLog(wt, "agent-flow.log");

      const pullResult = await runClaude(
        langInstruction() +
          `Faça pull das alterações remotas do branch '${wt.branch}' (origin/${wt.branch}) para o branch local. ` +
          `Use --no-verify onde necessário. Se houver conflitos de merge, resolva-os mantendo as alterações locais ` +
          `quando fizer sentido e integrando as remotas. ` +
          `Não faça commit nem push — deixe as alterações prontas para revisão.`,
        wt.path,
        logStream,
        null,
      );

      await new Promise((resolve) => logStream.end(resolve));

      if (pullResult.code !== 0) {
        updateWorktreeStatus(id, {
          pullStatus: "error",
          pullLastError: failureDetail(pullResult, logStream.persistPath),
        });
        return;
      }

      updateWorktreeStatus(id, { pullStatus: "done" });
    })();
  });
}
