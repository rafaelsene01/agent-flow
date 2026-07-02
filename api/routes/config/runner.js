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
import { createPullRequest } from "../../modules/github/github.branches.js";
import {
  acquireSlot,
  releaseSlot,
  registerProcess,
  unregisterProcess,
  cancelProcess,
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
import { scanTlcFeatures } from "./tlc.js";
import { getAgent, buildAgentPrompt } from "../../modules/agents/agents.service.js";

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

function lastTaskOrSpecSession(wt) {
  const sessions = (wt.chatSessions ?? [])
    .filter((s) => s.started && (s.origin === "task" || s.origin === "spec"))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return sessions[0] ?? null;
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

function findSpecContent(basePath) {
  const scanned = scanTlcFeatures(basePath);
  if (scanned?.tlcFiles?.spec) {
    const specPath = path.join(scanned.tlcFeaturePath, "spec.md");
    if (fs.existsSync(specPath)) return { specPath };
  }
  return null;
}

function migrateSpecsToHelpers(wtPath, helpersDir) {
  const src = path.join(wtPath, ".specs");
  if (!fs.existsSync(src)) return;
  try {
    fs.cpSync(src, path.join(helpersDir, ".specs"), {
      recursive: true,
      force: true,
    });
    fs.rmSync(src, { recursive: true, force: true });
  } catch (_) {}
}

async function computeBaseRef(wtPath) {
  try {
    const { stdout: originHead } = await execFileP(
      "git",
      ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
      { cwd: wtPath, timeout: 5_000 },
    );
    const base = originHead.trim();
    if (!base) return null;
    const { stdout: mb } = await execFileP(
      "git",
      ["merge-base", "HEAD", base],
      { cwd: wtPath, timeout: 5_000 },
    );
    return mb.trim() || null;
  } catch {
    return null;
  }
}

function langInstruction() {
  const lang = getLanguage();
  return lang === "pt"
    ? "Responda em português do Brasil.\n\n"
    : "Respond in English.\n\n";
}

// Extrai o texto final da resposta do Claude a partir do stdout raw (stream-json).
// Evita o eco do PROMPT no log persistido — que contém o template literal e
// faria o regex casar com os placeholders em vez da resposta real.
function extractFinalText(rawOutput) {
  let finalText = "";
  for (const line of (rawOutput ?? "").split("\n")) {
    const s = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
    if (!s) continue;
    try {
      const ev = JSON.parse(s);
      if (ev.type === "result" && typeof ev.result === "string") {
        finalText = ev.result;
      } else if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
        for (const block of ev.message.content) {
          if (block.type === "text" && block.text?.trim()) finalText = block.text;
        }
      }
    } catch {
      // linha não-JSON (ex: stderr concatenado) — ignora
    }
  }
  return finalText;
}

// Instrução injetada nos prompts que precisam interromper a execução quando
// falta uma decisão do usuário sem padrão razoável.
const ASK_RULES =
  "Se faltar uma decisão do usuário e não houver padrão razoável, " +
  "NÃO tente adivinhar — pare a implementação e emita, como ÚLTIMA linha " +
  "da resposta, exatamente `ASK: <pergunta objetiva>`. " +
  "Caso contrário, implemente sem perguntar. Emita no máximo um ASK por resposta.";

// Retorna a pergunta contida no marcador ASK: da última ocorrência na resposta
// final do agente, ou null se não houver nenhum marcador.
function parseAsk(finalText) {
  const text = finalText ?? "";
  const lines = text.split("\n");
  // Encontra o índice da última linha que começa com "ASK:"
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^ASK:/.test(lines[i])) lastIdx = i;
  }
  if (lastIdx === -1) return null;
  // Captura tudo a partir do "ASK:" até o fim do texto (inclusive múltiplas linhas)
  const fromAsk = lines.slice(lastIdx).join("\n");
  const m = fromAsk.match(/^ASK:\s*([\s\S]+)/);
  return m ? m[1].trim() : null;
}

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
      if (!wt)
        return sendError(res, 404, "Worktree não encontrado na configuração.");
      if (!fs.existsSync(wt.path))
        return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

      const helpersDir = getHelpersDir(wt);
      const filePath = path.join(helpersDir, "CARD.md");
      fs.writeFileSync(
        filePath,
        buildCardLines({ title, number, body, branch: wt.branch }).join("\n"),
        "utf-8",
      );
      res.json({ ok: true, filePath });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.post("/api/config/worktrees/:id/run", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { title, number, body, model, effort, sessionId } = req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)
      return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    try {
      acquireSlot();
    } catch (err) {
      return sendError(res, err.status ?? 500, err.message);
    }

    try {
      fs.writeFileSync(
        path.join(getHelpersDir(wt), "CARD.md"),
        buildCardLines({ title, number, body, branch: wt.branch }).join("\n"),
        "utf-8",
      );
    } catch (err) {
      releaseSlot();
      return sendError(res, 500, `Erro ao criar CARD.md: ${err.message}`, err);
    }

    let runSessionId, logFile, sessionStarted;
    if (sessionId) {
      const entry = (wt.chatSessions ?? []).find((s) => s.id === sessionId);
      if (entry) {
        runSessionId = entry.id;
        logFile = entry.logFile ?? makeLogFile("task");
        sessionStarted = entry.started;
      }
    }
    if (!runSessionId) {
      logFile = makeLogFile("task");
      runSessionId = makeSessionId(wt, "task");
      appendChatSession(id, {
        id: runSessionId,
        logFile,
        origin: "task",
        description: truncateDesc(body || title),
        started: false,
        createdAt: new Date().toISOString(),
      });
      sessionStarted = false;
    }

    updateWorktreeStatus(id, {
      status: "running",
      lastRunAt: new Date().toISOString(),
      lastError: null,
      cleanupDone: false,
      commitPushStatus: null,
      pendingCommitMsg: null,
    });
    res.json({ ok: true });

    const logStream = createRunLog(wt, logFile, { append: !!sessionId });

    (async () => {
      try {
        const { stdout: headBefore } = await execFileP(
          "git",
          ["rev-parse", "HEAD"],
          { cwd: wt.path, timeout: 5_000 },
        ).catch(() => ({ stdout: "" }));
        const initialHead = headBefore.trim();

        logStream.write("=== Step 1: implementing task ===\n");
        const cardContent = fs.readFileSync(
          path.join(getHelpersDir(wt), "CARD.md"),
          "utf-8",
        );

        const prompt =
          langInstruction() +
          "You are an autonomous coding agent. Implement the task below immediately.\n" +
          "Rules:\n" +
          "- Use Write and Edit tools to create/modify files. Do NOT describe — just do it.\n" +
          ASK_RULES + "\n" +
          "- Do NOT run any git commands.\n" +
          "TASK:\n" +
          cardContent;

        const impl = await (sessionStarted
          ? resumeClaude(prompt, wt.path, logStream, runSessionId, (child) => registerProcess(id, child), { model: model || "sonnet", effort: effort || "medium" })
          : runClaude(prompt, wt.path, logStream, runSessionId, (child) => { registerProcess(id, child); updateChatSession(id, runSessionId, { started: true }); }, { model: model || "sonnet", effort: effort || "medium" }));

        if (impl.code !== 0) {
          logStream.end();
          updateWorktreeStatus(id, {
            status: "error",
            lastError: `Implementation failed: ${failureDetail(impl, logStream.persistPath)}`,
          });
          return;
        }

        // Detecta pergunta do agente — estado terminal válido (não dispara "no files changed")
        const ask = parseAsk(extractFinalText(impl.output));
        if (ask) {
          updateChatSession(id, runSessionId, { started: true });
          await new Promise((resolve) => logStream.end(resolve));
          updateWorktreeStatus(id, {
            status: "waiting-input",
            pendingQuestion: ask,
            pendingSessionId: runSessionId,
          });
          return;
        }

        if (initialHead) {
          const { stdout: countOut } = await execFileP(
            "git",
            ["rev-list", "--count", `${initialHead}..HEAD`],
            { cwd: wt.path, timeout: 5_000 },
          ).catch(() => ({ stdout: "0" }));
          const claudeCommits = parseInt(countOut.trim(), 10) || 0;
          if (claudeCommits > 0) {
            logStream.write(
              `\n=== Step 2: squashing ${claudeCommits} commit(s) from Claude ===\n`,
            );
            await execFileP(
              "git",
              ["reset", "--soft", `HEAD~${claudeCommits}`],
              { cwd: wt.path, timeout: 15_000 },
            ).catch((e) =>
              logStream.write(`Warning: reset failed: ${e.message}\n`),
            );
          }
        }

        const { stdout: changesOut } = await execFileP(
          "git",
          ["status", "--porcelain"],
          { cwd: wt.path, timeout: 10_000 },
        ).catch(() => ({ stdout: "" }));
        const realChanges = changesOut
          .trim()
          .split("\n")
          .filter((l) => {
            if (!l.trim()) return false;
            const file = l.slice(3).trim();
            return (
              !INTERNAL.includes(file) &&
              !file.endsWith(".log") &&
              !file.startsWith(".specs/")
            );
          });

        if (realChanges.length === 0) {
          logStream.end();
          updateWorktreeStatus(id, {
            status: "error",
            lastError: `Implementation failed: no files were changed by Claude\n(log completo: ${logStream.persistPath})`,
          });
          return;
        }

        updateChatSession(id, runSessionId, { started: true });
        await new Promise((resolve) => logStream.end(resolve));
        updateWorktreeStatus(id, { status: "done" });
      } finally {
        unregisterProcess(id);
        releaseSlot();
      }
    })();
  });

  // Executa um agente pela mesma pipeline autônoma do /run (CARD.md, squash de
  // commits, detecção de ASK), mas com o prompt do agente (skills + instruções)
  // como persona e usando o campo próprio `agentStatus` para o feedback visual.
  app.post("/api/config/worktrees/:id/run-agent", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { agentId, title, number, body, model, effort, sessionId } = req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)
      return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    let agentPrompt, agentName;
    try {
      const agent = getAgent(agentId);
      if (!agent) return sendError(res, 400, "Agente não encontrado.");
      agentName = agent.name;
      agentPrompt = buildAgentPrompt(agentId);
    } catch (err) {
      return sendError(res, 500, err.message, err);
    }

    try {
      acquireSlot();
    } catch (err) {
      return sendError(res, err.status ?? 500, err.message);
    }

    try {
      fs.writeFileSync(
        path.join(getHelpersDir(wt), "CARD.md"),
        buildCardLines({ title, number, body, branch: wt.branch }).join("\n"),
        "utf-8",
      );
    } catch (err) {
      releaseSlot();
      return sendError(res, 500, `Erro ao criar CARD.md: ${err.message}`, err);
    }

    let runSessionId, logFile, sessionStarted;
    if (sessionId) {
      const entry = (wt.chatSessions ?? []).find((s) => s.id === sessionId);
      if (entry) {
        runSessionId = entry.id;
        logFile = entry.logFile ?? makeLogFile("agent");
        sessionStarted = entry.started;
      }
    }
    if (!runSessionId) {
      logFile = makeLogFile("agent");
      runSessionId = makeSessionId(wt, "agent");
      appendChatSession(id, {
        id: runSessionId,
        logFile,
        origin: "agent",
        description: truncateDesc(`${agentName}: ${body || title}`),
        started: false,
        createdAt: new Date().toISOString(),
      });
      sessionStarted = false;
    }

    updateWorktreeStatus(id, {
      agentStatus: "running",
      agentLastRunAt: new Date().toISOString(),
      agentLastError: null,
    });
    res.json({ ok: true, sessionId: runSessionId });

    const logStream = createRunLog(wt, logFile, { append: !!sessionId });

    (async () => {
      try {
        const { stdout: headBefore } = await execFileP(
          "git",
          ["rev-parse", "HEAD"],
          { cwd: wt.path, timeout: 5_000 },
        ).catch(() => ({ stdout: "" }));
        const initialHead = headBefore.trim();

        // Garante que artefatos internos (.specs/, logs, CARD.md) fiquem fora do
        // git da worktree, caso alguma skill os gere durante a execução.
        await ensureWorktreeExclude(wt.path);

        logStream.write(`=== Executando agente: ${agentName} ===\n`);
        const cardContent = fs.readFileSync(
          path.join(getHelpersDir(wt), "CARD.md"),
          "utf-8",
        );

        const prompt =
          langInstruction() +
          agentPrompt +
          "\n\nRegras de execução:\n" +
          "- Use as ferramentas Write e Edit para criar/modificar arquivos. NÃO descreva — faça.\n" +
          "- Aja SOMENTE com base nas instruções e skills fornecidas acima neste prompt. " +
          "NÃO acione nenhuma outra skill instalada (ferramenta Skill / slash-commands como tlc-spec-driven) " +
          "nem inicie fluxos de spec/design/tasks que não tenham sido pedidos pela skill do agente.\n" +
          ASK_RULES + "\n" +
          "- NÃO rode nenhum comando git.\n" +
          "TAREFA (card do board):\n" +
          cardContent;

        const impl = await (sessionStarted
          ? resumeClaude(prompt, wt.path, logStream, runSessionId, (child) => registerProcess(id, child), { model: model || "sonnet", effort: effort || "medium" })
          : runClaude(prompt, wt.path, logStream, runSessionId, (child) => { registerProcess(id, child); updateChatSession(id, runSessionId, { started: true }); }, { model: model || "sonnet", effort: effort || "medium" }));

        if (impl.code !== 0) {
          logStream.end();
          updateWorktreeStatus(id, {
            agentStatus: "error",
            agentLastError: `Execução do agente falhou: ${failureDetail(impl, logStream.persistPath)}`,
          });
          return;
        }

        const ask = parseAsk(extractFinalText(impl.output));
        if (ask) {
          updateChatSession(id, runSessionId, { started: true });
          await new Promise((resolve) => logStream.end(resolve));
          updateWorktreeStatus(id, {
            agentStatus: "waiting-input",
            pendingQuestion: ask,
            pendingSessionId: runSessionId,
          });
          return;
        }

        // Move qualquer .specs/ gerado na worktree para a pasta helpers, mantendo
        // a worktree do projeto limpa (mesmo tratamento da pipeline TLC).
        migrateSpecsToHelpers(wt.path, getHelpersDir(wt));

        if (initialHead) {
          const { stdout: countOut } = await execFileP(
            "git",
            ["rev-list", "--count", `${initialHead}..HEAD`],
            { cwd: wt.path, timeout: 5_000 },
          ).catch(() => ({ stdout: "0" }));
          const claudeCommits = parseInt(countOut.trim(), 10) || 0;
          if (claudeCommits > 0) {
            logStream.write(
              `\n=== Squashing ${claudeCommits} commit(s) from Claude ===\n`,
            );
            await execFileP(
              "git",
              ["reset", "--soft", `HEAD~${claudeCommits}`],
              { cwd: wt.path, timeout: 15_000 },
            ).catch((e) =>
              logStream.write(`Warning: reset failed: ${e.message}\n`),
            );
          }
        }

        const { stdout: changesOut } = await execFileP(
          "git",
          ["status", "--porcelain"],
          { cwd: wt.path, timeout: 10_000 },
        ).catch(() => ({ stdout: "" }));
        const realChanges = changesOut
          .trim()
          .split("\n")
          .filter((l) => {
            if (!l.trim()) return false;
            const file = l.slice(3).trim();
            return (
              !INTERNAL.includes(file) &&
              !file.endsWith(".log") &&
              !file.startsWith(".specs/")
            );
          });

        if (realChanges.length === 0) {
          logStream.end();
          updateWorktreeStatus(id, {
            agentStatus: "error",
            agentLastError: `Execução do agente falhou: nenhum arquivo foi alterado\n(log completo: ${logStream.persistPath})`,
          });
          return;
        }

        updateChatSession(id, runSessionId, { started: true });
        await new Promise((resolve) => logStream.end(resolve));
        updateWorktreeStatus(id, { agentStatus: "done" });
      } finally {
        unregisterProcess(id);
        releaseSlot();
      }
    })();
  });

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

  app.post("/api/config/worktrees/:id/run-tlc", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { title, number, body, model, effort, sessionId } = req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)
      return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    const tlcHelpersDir = getHelpersDir(wt);
    try {
      fs.writeFileSync(
        path.join(tlcHelpersDir, "CARD.md"),
        buildCardLines({ title, number, body, branch: wt.branch }).join("\n"),
        "utf-8",
      );
    } catch (err) {
      return sendError(res, 500, `Erro ao criar CARD.md: ${err.message}`, err);
    }

    let tlcSessionId, logFile, sessionStarted;
    if (sessionId) {
      const entry = (wt.chatSessions ?? []).find((s) => s.id === sessionId);
      if (entry) {
        tlcSessionId = entry.id;
        logFile = entry.logFile ?? makeLogFile("tlc");
        sessionStarted = entry.started;
      }
    }
    if (!tlcSessionId) {
      logFile = makeLogFile("tlc");
      tlcSessionId = makeSessionId(wt, "tlc");
      appendChatSession(id, {
        id: tlcSessionId,
        logFile,
        origin: "tlc",
        description: truncateDesc(body || title),
        started: false,
        createdAt: new Date().toISOString(),
      });
      sessionStarted = false;
    }

    updateWorktreeStatus(id, {
      tlcStatus: "running",
      tlcLastRunAt: new Date().toISOString(),
      tlcLastError: null,
    });
    res.json({ ok: true });

    const logStream = createRunLog(wt, logFile, { append: !!sessionId });

    (async () => {
      logStream.write("=== TLC: Criando spec, design e tasks ===\n");
      const cardContent = fs.readFileSync(
        path.join(tlcHelpersDir, "CARD.md"),
        "utf-8",
      );

      const prompt =
        langInstruction() +
        "/tlc-spec-driven\n\n" +
        "Leia o conteúdo abaixo e execute as fases Specify, Design e Tasks completas.\n\n" +
        cardContent;

      const result = await (sessionStarted
        ? resumeClaude(prompt, wt.path, logStream, tlcSessionId, null, { model: model || "opus", effort: effort || "high" })
        : runClaude(prompt, wt.path, logStream, tlcSessionId, () => updateChatSession(id, tlcSessionId, { started: true }), { model: model || "opus", effort: effort || "high" }));

      if (result.code !== 0) {
        logStream.end();
        updateWorktreeStatus(id, {
          tlcStatus: "error",
          tlcLastError: `TLC failed: ${failureDetail(result, logStream.persistPath)}`,
        });
        return;
      }

      updateChatSession(id, tlcSessionId, { started: true });
      fs.rmSync(path.join(tlcHelpersDir, "CARD.md"), { force: true });
      migrateSpecsToHelpers(wt.path, tlcHelpersDir);
      logStream.end();

      const featuresDir = path.join(tlcHelpersDir, ".specs", "features");
      let tlcFeaturePath = null;
      const tlcFiles = { spec: false, design: false, tasks: false };

      if (fs.existsSync(featuresDir)) {
        const dirs = fs
          .readdirSync(featuresDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => ({
            name: d.name,
            mtime: fs.statSync(path.join(featuresDir, d.name)).mtimeMs,
          }))
          .sort((a, b) => b.mtime - a.mtime);

        if (dirs.length > 0) {
          tlcFeaturePath = path.join(featuresDir, dirs[0].name);
          for (const type of ["spec", "design", "tasks"]) {
            tlcFiles[type] = fs.existsSync(
              path.join(tlcFeaturePath, `${type}.md`),
            );
          }
        }
      }

      updateWorktreeStatus(id, { tlcStatus: "done", tlcFeaturePath, tlcFiles });
    })();
  });

  app.post("/api/config/worktrees/:id/run-tlc-exec", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { model, effort, sessionId } = req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)
      return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    try {
      acquireSlot();
    } catch (err) {
      return sendError(res, err.status ?? 500, err.message);
    }

    let featurePath = wt.tlcFeaturePath;
    if (!featurePath || !fs.existsSync(featurePath)) {
      const scanned = scanTlcFeatures(getHelpersDir(wt));
      if (!scanned) {
        releaseSlot();
        return sendError(
          res,
          400,
          "Nenhum feature TLC encontrado na worktree.",
        );
      }
      featurePath = scanned.tlcFeaturePath;
      updateWorktreeStatus(id, {
        tlcFeaturePath: featurePath,
        tlcFiles: scanned.tlcFiles,
      });
    }

    const specFilePath = path.join(featurePath, "spec.md").replace(/\\/g, "/");

    let tlcExecSessionId, logFile, sessionStarted;
    if (sessionId) {
      const entry = (wt.chatSessions ?? []).find((s) => s.id === sessionId);
      if (entry) {
        tlcExecSessionId = entry.id;
        logFile = entry.logFile ?? makeLogFile("spec");
        sessionStarted = entry.started;
      }
    }
    if (!tlcExecSessionId) {
      logFile = makeLogFile("spec");
      tlcExecSessionId = makeSessionId(wt, "spec");
      appendChatSession(id, {
        id: tlcExecSessionId,
        logFile,
        origin: "spec",
        description: truncateDesc(path.basename(featurePath)),
        started: false,
        createdAt: new Date().toISOString(),
      });
      sessionStarted = false;
    }

    updateWorktreeStatus(id, {
      tlcExecStatus: "running",
      tlcExecLastRunAt: new Date().toISOString(),
      tlcExecLastError: null,
      cleanupDone: false,
      commitPushStatus: null,
      pendingCommitMsg: null,
    });
    res.json({ ok: true });

    const logStream = createRunLog(wt, logFile, { append: !!sessionId });

    (async () => {
      try {
        const { stdout: headBefore } = await execFileP(
          "git",
          ["rev-parse", "HEAD"],
          { cwd: wt.path, timeout: 5_000 },
        ).catch(() => ({ stdout: "" }));
        const initialHead = headBefore.trim();

        logStream.write("=== Step 1: executando spec ===\n");

        const execPrompt =
          langInstruction() +
          `Execute a spec em ${specFilePath} usando o máximo de subagentes possível. Não faça commits nem push.\n` +
          "Quando totalmente concluído, sua ÚLTIMA linha deve ser exatamente: COMMIT: <mensagem conventional commit>\n" +
          "(ex: COMMIT: feat: implement card sorting)\n" +
          ASK_RULES;

        const impl = await (sessionStarted
          ? resumeClaude(execPrompt, wt.path, logStream, tlcExecSessionId, (child) => registerProcess(id, child), { model: model || "sonnet", effort: effort || "medium" })
          : runClaude(execPrompt, wt.path, logStream, tlcExecSessionId, (child) => { registerProcess(id, child); updateChatSession(id, tlcExecSessionId, { started: true }); }, { model: model || "sonnet", effort: effort || "medium" }));

        if (impl.code !== 0) {
          logStream.end();
          updateWorktreeStatus(id, {
            tlcExecStatus: "error",
            tlcExecLastError: `Execução falhou: ${failureDetail(impl, logStream.persistPath)}`,
          });
          return;
        }

        // Detecta pergunta do agente — estado terminal válido para tlcExec
        const ask = parseAsk(extractFinalText(impl.output));
        if (ask) {
          updateChatSession(id, tlcExecSessionId, { started: true });
          await new Promise((resolve) => logStream.end(resolve));
          updateWorktreeStatus(id, {
            tlcExecStatus: "waiting-input",
            pendingQuestion: ask,
            pendingSessionId: tlcExecSessionId,
          });
          return;
        }

        if (initialHead) {
          const { stdout: countOut } = await execFileP(
            "git",
            ["rev-list", "--count", `${initialHead}..HEAD`],
            { cwd: wt.path, timeout: 5_000 },
          ).catch(() => ({ stdout: "0" }));
          const claudeCommits = parseInt(countOut.trim(), 10) || 0;
          if (claudeCommits > 0) {
            logStream.write(
              `\n=== Step 2: squashing ${claudeCommits} commit(s) intermediários ===\n`,
            );
            await execFileP(
              "git",
              ["reset", "--soft", `HEAD~${claudeCommits}`],
              { cwd: wt.path, timeout: 15_000 },
            ).catch((e) =>
              logStream.write(`Warning: reset failed: ${e.message}\n`),
            );
          }
        }

        updateChatSession(id, tlcExecSessionId, { started: true });
        await new Promise((resolve) => logStream.end(resolve));
        updateWorktreeStatus(id, { tlcExecStatus: "done" });
      } finally {
        unregisterProcess(id);
        releaseSlot();
      }
    })();
  });

  // Retoma uma sessão pausada em "waiting-input" com a resposta do usuário.
  app.post("/api/config/worktrees/:id/answer", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { answer, sessionId, model, effort } = req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)
      return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);
    if (!answer?.trim()) return sendError(res, 400, "Resposta obrigatória.");

    // Determina qual campo de status está aguardando input
    const field =
      wt.tlcExecStatus === "waiting-input" ? "tlcExecStatus"
        : wt.agentStatus === "waiting-input" ? "agentStatus"
          : "status";
    const lastRunField =
      field === "tlcExecStatus" ? "tlcExecLastRunAt"
        : field === "agentStatus" ? "agentLastRunAt"
          : "lastRunAt";
    const lastErrorField =
      field === "tlcExecStatus" ? "tlcExecLastError"
        : field === "agentStatus" ? "agentLastError"
          : "lastError";

    if (wt[field] !== "waiting-input")
      return sendError(res, 409, "Worktree não está aguardando input.");
    if (wt.pendingSessionId !== sessionId)
      return sendError(res, 400, "Sessão não corresponde à pergunta pendente.");

    const entry = (wt.chatSessions ?? []).find((s) => s.id === sessionId);
    if (!entry) return sendError(res, 400, "Sessão não encontrada.");

    try {
      acquireSlot();
    } catch (err) {
      return sendError(res, err.status ?? 500, err.message);
    }

    // Marca como running e limpa campos pendentes antes de responder ao cliente
    updateWorktreeStatus(id, {
      [field]: "running",
      [lastRunField]: new Date().toISOString(),
      [lastErrorField]: null,
      pendingQuestion: null,
      pendingSessionId: null,
    });
    res.json({ ok: true });

    const logFile = entry.logFile;
    const helpersLogPath = path.join(getHelpersDir(wt), logFile);
    const existing = fs.existsSync(helpersLogPath)
      ? fs.readFileSync(helpersLogPath, "utf-8")
      : "";
    const logStream = createRunLog(wt, logFile, { append: true, initialContent: existing });

    (async () => {
      try {
        logStream.write("=== Resposta do usuário (resume) ===\n");
        const prompt =
          langInstruction() +
          "Resposta do usuário à sua pergunta:\n" +
          answer.trim() +
          "\n\nContinue a tarefa de onde parou. " +
          ASK_RULES;

        const result = await resumeClaude(
          prompt,
          wt.path,
          logStream,
          sessionId,
          (child) => registerProcess(id, child),
          { model: model || "sonnet", effort: effort || "medium" },
        );

        if (result.code !== 0) {
          logStream.end();
          updateWorktreeStatus(id, {
            [field]: "error",
            [lastErrorField]: `Resume falhou: ${failureDetail(result, logStream.persistPath)}`,
          });
          return;
        }

        const ask = parseAsk(extractFinalText(result.output));
        await new Promise((resolve) => logStream.end(resolve));
        if (ask) {
          // Agente fez outra pergunta — volta para waiting-input
          updateWorktreeStatus(id, {
            [field]: "waiting-input",
            pendingQuestion: ask,
            pendingSessionId: sessionId,
          });
        } else {
          updateChatSession(id, sessionId, { started: true });
          updateWorktreeStatus(id, { [field]: "done" });
        }
      } finally {
        unregisterProcess(id);
        releaseSlot();
      }
    })();
  });

  app.post("/api/config/worktrees/:id/run-spec-eval", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { title, number, body, model, effort, validation, runTests, sessionId } =
      req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)
      return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    try {
      acquireSlot();
    } catch (err) {
      return sendError(res, err.status ?? 500, err.message);
    }

    let evalSessionId, logFile, sessionStarted;
    if (sessionId) {
      const entry = (wt.chatSessions ?? []).find((s) => s.id === sessionId);
      if (entry) {
        evalSessionId = entry.id;
        logFile = entry.logFile ?? makeLogFile("eval");
        sessionStarted = entry.started;
      }
    }
    if (!evalSessionId) {
      logFile = makeLogFile("eval");
      evalSessionId = makeSessionId(wt, "eval");
      appendChatSession(id, {
        id: evalSessionId,
        logFile,
        origin: "eval",
        description: truncateDesc(body || title),
        started: false,
        createdAt: new Date().toISOString(),
      });
      sessionStarted = false;
    }

    updateWorktreeStatus(id, {
      specEvalStatus: "running",
      specEvalLastRunAt: new Date().toISOString(),
      specEvalLastError: null,
    });
    res.json({ ok: true });

    const logStream = createRunLog(wt, logFile, { append: !!sessionId });

    (async () => {
      try {
        const evalHelpersDir = getHelpersDir(wt);
        const spec = findSpecContent(evalHelpersDir);
        const baseRef = await computeBaseRef(wt.path);

        const specSection = spec
          ? `A especificação (PRD) está em \`${spec.specPath.replace(/\\/g, "/")}\`. ` +
            `Leia esse arquivo e use-o como ground truth da avaliação.`
          : "Não há spec.md gerado nesta worktree. Use a descrição do card abaixo como a especificação (PRD) — " +
            "ground truth da avaliação:\n\n" +
            buildCardLines({ title, number, body, branch: wt.branch }).join(
              "\n",
            );

        const baseSection = baseRef
          ? `O ponto base da implementação é o commit \`${baseRef}\`. ` +
            "A implementação a avaliar é TUDO que mudou desde esse base nesta worktree. Considere a UNIÃO de:\n" +
            `- commits já feitos no branch, inclusive os que já foram enviados ao remote: \`git diff ${baseRef}..HEAD\`;\n` +
            `- alterações locais ainda não commitadas e em stage: \`git diff ${baseRef}\` (cobre o working tree) ` +
            "e `git status --porcelain` para arquivos novos não rastreados."
          : "Determine o ponto base da implementação (merge-base de HEAD com origin/HEAD) e avalie a UNIÃO de: " +
            "commits do branch (incluindo os já enviados ao remote) E as alterações locais não commitadas/staged " +
            "(`git diff`, `git status`).";

        const evalOutputDir = path
          .join(evalHelpersDir, ".specs", "evaluations")
          .replace(/\\/g, "/");
        fs.mkdirSync(path.join(evalHelpersDir, ".specs", "evaluations"), {
          recursive: true,
        });

        const validationCmds = [
          validation?.install && `- Instalação: \`${validation.install}\``,
          validation?.build && `- Build: \`${validation.build}\``,
          validation?.lint && `- Lint: \`${validation.lint}\``,
          runTests !== false &&
            validation?.test &&
            `- Testes: \`${validation.test}\``,
          validation?.extra && `- Extra: \`${validation.extra}\``,
        ].filter(Boolean);

        const validationSection =
          validationCmds.length > 0
            ? "Comandos de validação disponíveis para verificar a implementação (use-os quando necessário):\n" +
              validationCmds.join("\n")
            : "";

        const testsInstruction =
          runTests === false
            ? "\n\nIMPORTANTE: NÃO execute nem avalie testes. Ignore completamente qualquer menção a testes — " +
              "não os rode, não os considere na avaliação e não os mencione no relatório."
            : "";

        logStream.write(
          "=== Spec-Eval: avaliando implementação contra a spec ===\n",
        );

        const evalPrompt =
          langInstruction() +
          "/spec-driven-eval\n\n" +
          "Siga a guideline spec-driven-eval e avalie (grade) a implementação no branch atual desta worktree, " +
          "produzindo a nota final comparável.\n\n" +
          specSection +
          "\n\n" +
          baseSection +
          "\n\n" +
          (validationSection ? validationSection + "\n\n" : "") +
          "Não modifique o código sob avaliação e não faça commits nem push. " +
          `Escreva o relatório com a nota final em \`${evalOutputDir}\`.` +
          testsInstruction;

        const result = await (sessionStarted
          ? resumeClaude(evalPrompt, wt.path, logStream, evalSessionId, (child) => registerProcess(id, child), { model: model || "opus", effort: effort || "high" })
          : runClaude(evalPrompt, wt.path, logStream, evalSessionId, (child) => { registerProcess(id, child); updateChatSession(id, evalSessionId, { started: true }); }, { model: model || "opus", effort: effort || "high" }));

        if (result.code !== 0) {
          logStream.end();
          updateWorktreeStatus(id, {
            specEvalStatus: "error",
            specEvalLastError: `Spec-eval falhou: ${failureDetail(result, logStream.persistPath)}`,
          });
          return;
        }

        updateChatSession(id, evalSessionId, { started: true });
        await new Promise((resolve) => logStream.end(resolve));
        updateWorktreeStatus(id, { specEvalStatus: "done" });
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

    updateWorktreeStatus(id, { cleanupDone: true, commitPushStatus: null });
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

  app.post("/api/config/worktrees/:id/commit-push", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { model, effort, sessionId } = req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)
      return sendError(res, 404, "Worktree não encontrado na configuração.");
    if (!fs.existsSync(wt.path))
      return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    const logFile = makeLogFile("commit-push");
    const commitSessionId = makeSessionId(wt, "commit-push");
    appendChatSession(id, {
      id: commitSessionId,
      logFile,
      origin: "chat",
      description: "Commit & Push",
      started: false,
      createdAt: new Date().toISOString(),
    });

    updateWorktreeStatus(id, {
      commitPushStatus: "running",
      commitPushLastRunAt: new Date().toISOString(),
      commitPushLastError: null,
    });
    res.json({ ok: true });

    const logStream = createRunLog(wt, logFile, { append: !!sessionId });

    (async () => {
      await ensureWorktreeExclude(wt.path);

      logStream.write("=== Step 1: staging all changes ===\n");
      try {
        await execFileP("git", ["add", "-A"], {
          cwd: wt.path,
          timeout: 30_000,
        });
      } catch (err) {
        await new Promise((resolve) => logStream.end(resolve));
        updateWorktreeStatus(id, {
          commitPushStatus: "error",
          commitPushLastError: `git add falhou: ${err.message}`,
        });
        return;
      }

      const { stdout: statusOut } = await execFileP(
        "git",
        ["status", "--porcelain"],
        { cwd: wt.path, timeout: 10_000 },
      ).catch(() => ({ stdout: "" }));

      if (statusOut.trim()) {
        const freshWt = getWorktrees().find((w) => w.id === id);
        const opts = { model: model || "sonnet", effort: effort || "medium" };

        let targetSessionId, sessionStarted;
        if (sessionId) {
          const entry = (freshWt?.chatSessions ?? []).find((s) => s.id === sessionId);
          if (entry) {
            targetSessionId = entry.id;
            sessionStarted = entry.started;
          }
        }
        if (!targetSessionId) {
          const lastSession = lastTaskOrSpecSession(freshWt ?? wt);
          targetSessionId = lastSession?.id ?? null;
          sessionStarted = lastSession?.started ?? false;
        }

        logStream.write("=== Step 2: creating semantic commit ===\n");
        let commitResult;

        if (targetSessionId && sessionStarted) {
          commitResult = await resumeClaude(
            langInstruction() +
              "Com base em tudo que foi implementado nesta sessão, crie um commit semântico (conventional commits) " +
              "com todas as mudanças staged. Use --no-verify. Não faça push.",
            wt.path,
            logStream,
            targetSessionId,
            null,
            opts,
          );
        } else {
          const newCommitSessionId = targetSessionId ?? commitSessionId;
          commitResult = await runClaude(
            langInstruction() +
              "Analise as mudanças staged (`git diff --staged`) e crie um commit semântico (conventional commits) " +
              "com `--no-verify`. Não faça push.",
            wt.path,
            logStream,
            newCommitSessionId,
            () => updateChatSession(id, newCommitSessionId, { started: true }),
            opts,
          );
        }

        if (commitResult.code !== 0) {
          await new Promise((resolve) => logStream.end(resolve));
          updateWorktreeStatus(id, {
            commitPushStatus: "error",
            commitPushLastError: `Commit falhou: ${failureDetail(commitResult, logStream.persistPath)}`,
          });
          return;
        }
      } else {
        logStream.write("=== Nenhuma alteração staged para commitar ===\n");
      }

      logStream.write("=== Step 3: pushing to remote ===\n");
      try {
        const { stdout: pushOut, stderr: pushErr } = await execFileP(
          "git",
          ["push", "--no-verify", "origin", `HEAD:${wt.branch}`],
          { cwd: wt.path, timeout: 60_000 },
        );
        if (pushOut) logStream.write(pushOut);
        if (pushErr) logStream.write(pushErr);
      } catch (err) {
        await new Promise((resolve) => logStream.end(resolve));
        updateWorktreeStatus(id, {
          commitPushStatus: "error",
          commitPushLastError: `Push falhou: ${err.message}`,
        });
        return;
      }

      updateChatSession(id, commitSessionId, { started: true });
      await new Promise((resolve) => logStream.end(resolve));
      updateWorktreeStatus(id, { commitPushStatus: "done" });
    })();
  });

  app.post("/api/config/worktrees/:id/create-pr", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const { title, number, model, effort, sessionId } = req.body ?? {};

    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt) return sendError(res, 404, "Worktree não encontrado.");
    if (!wt.originBranch) return sendError(res, 400, "Branch de origem não configurada. Reconfigure a branch do card.");
    if (!fs.existsSync(wt.path)) return sendError(res, 400, `Diretório não encontrado: ${wt.path}`);

    const [owner, repo] = (wt.repo ?? "").split("/");
    if (!owner || !repo) return sendError(res, 400, "Repositório inválido.");

    const logFile = makeLogFile("create-pr");
    const prSessionId = makeSessionId(wt, "create-pr");
    appendChatSession(id, {
      id: prSessionId,
      logFile,
      origin: "create-pr",
      description: `PR: ${title ?? ""}`.trim(),
      started: false,
      createdAt: new Date().toISOString(),
    });

    updateWorktreeStatus(id, { prStatus: "running", prUrl: null, prLastError: null });
    res.json({ ok: true });

    const logStream = createRunLog(wt, logFile, { append: false });

    (async () => {
      try {
        let commitLog = "";
        let diffStat = "";
        const base = `origin/${wt.originBranch}`;
        try {
          const { stdout: log } = await execFileP(
            "git",
            ["log", `${base}..HEAD`, "--oneline", "--no-decorate"],
            { cwd: wt.path, timeout: 15_000 },
          );
          commitLog = log.trim();
        } catch (e) {
          logStream.write(`Warning: git log falhou: ${e.message}\n`);
        }
        try {
          const { stdout: stat } = await execFileP(
            "git",
            ["diff", "--stat", base],
            { cwd: wt.path, timeout: 15_000 },
          );
          diffStat = stat.trim();
        } catch (e) {
          logStream.write(`Warning: git diff --stat falhou: ${e.message}\n`);
        }

        const cardRef = number != null ? `#${number}` : "";
        const cardTitle = [cardRef, title].filter(Boolean).join(" ");

        const prompt =
          langInstruction() +
          `Você vai gerar o título e a descrição de um Pull Request.\n\n` +
          `Branch: \`${wt.branch}\` → base: \`${wt.originBranch}\`\n` +
          `Card: ${cardTitle}\n\n` +
          (commitLog ? `Commits:\n${commitLog}\n\n` : "") +
          (diffStat  ? `Arquivos alterados (git diff --stat):\n${diffStat}\n\n` : "") +
          `Execute \`git diff ${base}\` para ver as mudanças completas e entender o que foi feito.\n\n` +
          `Regras:\n` +
          `- O TÍTULO deve ser semântico (conventional commit style, ex: "feat: …", "fix: …") com no máximo 72 chars. Não inclua ${cardRef} no título.\n` +
          `- O BODY deve OBRIGATORIAMENTE começar com a linha \`${cardRef}\` (referência do card), seguida de uma linha em branco, e então um resumo em markdown do que foi implementado/alterado/removido com base no diff real do código.\n` +
          `- NÃO inclua estatísticas (contagem de linhas, número de arquivos alterados, insertions/deletions) na descrição. Foque no QUE foi feito, não em métricas.\n` +
          `- Não modifique arquivos. Não faça commit nem push.\n\n` +
          `Produza EXATAMENTE este bloco como última saída (sem nada depois):\n` +
          `PR_TITLE: <título semântico>\n` +
          `PR_BODY_START\n` +
          `${cardRef}\n\n` +
          `<resumo das mudanças em markdown>\n` +
          `PR_BODY_END`;

        logStream.write("=== Gerando descrição do PR ===\n");

        let targetSessionId = prSessionId;
        let sessionStarted = false;
        if (sessionId && sessionId !== "__new__") {
          const entry = (wt.chatSessions ?? []).find((s) => s.id === sessionId);
          if (entry) {
            targetSessionId = entry.id;
            sessionStarted = entry.started;
          }
        }

        const result = await (sessionStarted
          ? resumeClaude(prompt, wt.path, logStream, targetSessionId, null, { model: model || "sonnet", effort: effort || "medium" })
          : runClaude(prompt, wt.path, logStream, targetSessionId, () => updateChatSession(id, targetSessionId, { started: true }), { model: model || "sonnet", effort: effort || "medium" }));

        if (result.code !== 0) {
          await new Promise((resolve) => logStream.end(resolve));
          updateWorktreeStatus(id, {
            prStatus: "error",
            prLastError: `Geração falhou: ${failureDetail(result, logStream.persistPath)}`,
          });
          return;
        }

        const finalText = extractFinalText(result.output);
        const titleMatch = finalText.match(/PR_TITLE:\s*(.+)/);
        const bodyMatch  = finalText.match(/PR_BODY_START\r?\n([\s\S]*?)\r?\nPR_BODY_END/);

        const prTitle = (titleMatch?.[1]?.trim()) || cardTitle;
        const prBody  = (bodyMatch?.[1]?.trim())  || (commitLog ? `${cardRef}\n\n## Commits\n\`\`\`\n${commitLog}\n\`\`\`` : cardRef);

        const pr = await createPullRequest(owner, repo, {
          head:  wt.branch,
          base:  wt.originBranch,
          title: prTitle,
          body:  prBody,
        });

        updateChatSession(id, prSessionId, { started: true });
        await new Promise((resolve) => logStream.end(resolve));
        updateWorktreeStatus(id, { prStatus: "done", prUrl: pr.html_url });
      } catch (err) {
        await new Promise((resolve) => logStream.end(resolve)).catch(() => {});
        updateWorktreeStatus(id, { prStatus: "error", prLastError: err.message });
      }
    })();
  });

  app.delete("/api/config/worktrees/:id/run", (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const wt = getWorktrees().find((w) => w.id === id);
    if (!wt)
      return sendError(res, 404, "Worktree não encontrado na configuração.");

    const result = cancelProcess(id);
    if (result === "not-found")
      return sendError(res, 404, "Nenhum run ativo para esta worktree.");
    if (result === "already-done")
      return sendError(res, 409, "Run já finalizado.");

    updateWorktreeStatus(id, { status: "cancelled" });
    res.json({ ok: true });
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
