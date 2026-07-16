import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { getConfig, getHelpersDir } from "../config/config.service.js";
import { killTree } from "./claude.kill.js";

const LOGS_DIR = path.join(os.homedir(), ".agent-flow", "logs");
const isWin = process.platform === "win32";

// Deny rules do CLI: matar processos por nome derruba o próprio agent-flow e o
// run (tudo roda em node) — já aconteceu com `Get-Process node | Stop-Process`.
// São aplicadas pelo harness mesmo com --dangerously-skip-permissions; matar por
// PID (`Stop-Process -Id`/`kill <pid>`) continua liberado. Padrões sem espaço
// interno de propósito: com shell:true no Windows os args não são re-quotados.
// AskUserQuestion: em run headless não há UI para a pergunta; a resposta volta
// vazia e o agente "infere" em silêncio — bloqueado para forçar o agente a usar
// o canal de resposta do run (marcador ASK:) em vez da pergunta interativa.
const DENY_RULES = [
  "Bash(*pkill*)",
  "Bash(*killall*)",
  "Bash(*taskkill*)",
  "Bash(*Get-Process*Stop-Process*)",
  "Bash(*Stop-Process*-Name*)",
  "PowerShell(*taskkill*)",
  "PowerShell(*Get-Process*Stop-Process*)",
  "PowerShell(*Stop-Process*-Name*)",
  "PowerShell(*Stop-Process*-ProcessName*)",
  "AskUserQuestion",
].join(",");
const denyArgs = ["--disallowedTools", isWin ? `"${DENY_RULES}"` : DENY_RULES];

// Env do filho: remove os marcadores internos de runtime do Claude Code que o
// processo herda quando o agent-flow foi iniciado de dentro de uma sessão
// Claude Code — com eles o filho se considera sessão aninhada/retomada. Só
// nomes exatos + prefixo CLAUDECODE_: o namespace CLAUDE_CODE_* é config do
// usuário (ex.: CLAUDE_CODE_GIT_BASH_PATH, sem a qual o CLI no Windows não
// acha o bash) e precisa passar.
const INTERNAL_CLAUDE_ENV = new Set([
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_SSE_PORT",
]);

function buildChildEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (INTERNAL_CLAUDE_ENV.has(key) || key.startsWith("CLAUDECODE_")) continue;
    env[key] = value;
  }
  return env;
}

// ── SSE clients ────────────────────────────────────────────────────────────────

// Map<id, Set<Response>>
const sseClients = new Map();
// Map<id, string> — buffer do run atual para replay em clientes tardios
const logBuffers = new Map();
// Set<id> — runs ativos no momento (entre createRunLog e broadcastDone)
const activeRuns = new Set();

export function registerSseClient(id, res) {
  const isActive = activeRuns.has(id);
  const buffered = logBuffers.get(id) ?? "";
  // Replay do conteúdo já acumulado para o novo cliente
  if (buffered) {
    const lines = buffered.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const frame =
      lines
        .split("\n")
        .map((l) => `data: ${l}`)
        .join("\n") + "\n\n";
    try {
      res.write(frame);
    } catch (_) {}
  }

  // Se não há run ativo, sinaliza fim imediatamente (log histórico)
  if (!isActive) {
    try {
      res.write("event: done\ndata: \n\n");
    } catch (_) {}
    return () => {};
  }

  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id).add(res);
  return () => unregisterSseClient(id, res);
}

export function unregisterSseClient(id, res) {
  sseClients.get(id)?.delete(res);
}

function broadcastChunk(id, chunk) {
  logBuffers.set(id, (logBuffers.get(id) ?? "") + chunk);
  const clients = sseClients.get(id);
  if (!clients?.size) return;
  // Each line becomes its own "data:" field so newlines don't break the SSE frame.
  const lines = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const frame =
    lines
      .split("\n")
      .map((l) => `data: ${l}`)
      .join("\n") + "\n\n";
  for (const res of clients) {
    try {
      res.write(frame);
    } catch (_) {
      clients.delete(res);
    }
  }
}

export function broadcastDone(id) {
  activeRuns.delete(id);
  const clients = sseClients.get(id);
  if (clients?.size) {
    for (const res of clients) {
      try {
        res.write("event: done\ndata: \n\n");
        res.end();
      } catch (_) {}
    }
  }
  sseClients.delete(id);
  // Libera o buffer em memória: o histórico de um run finalizado é servido pelo
  // arquivo persistido (GET /log), não por replay. Sem isso o log completo de
  // cada run (id único) ficaria retido em RAM para sempre — vazamento.
  logBuffers.delete(id);
}

// ── Log streams ────────────────────────────────────────────────────────────────

export function createRunLog(wt, name, { append = false, initialContent = "" } = {}) {
  activeRuns.add(wt.id);
  logBuffers.set(wt.id, initialContent);
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const helpersDir  = getHelpersDir(wt);
  const persistPath = path.join(LOGS_DIR, `${path.basename(wt.path)}-${name}`);
  const flags = append ? "a" : "w";
  const streams = [
    fs.createWriteStream(path.join(helpersDir, name), { flags, encoding: "utf-8" }),
    fs.createWriteStream(persistPath, { flags, encoding: "utf-8" }),
  ];
  const id = wt.id;
  return {
    persistPath,
    write(chunk) {
      for (const s of streams) s.write(chunk);
      broadcastChunk(id, chunk);
    },
    end(cb) {
      broadcastDone(id);
      let pending = streams.length;
      for (const s of streams)
        s.end(() => {
          if (--pending === 0) cb?.();
        });
    },
  };
}

export function failureDetail(result, persistPath) {
  const reason =
    result.error ??
    (result.signal ? `signal ${result.signal}` : `exit code ${result.code}`);
  const tail = result.output.trim().slice(-500);
  const log = persistPath ? `\n(log completo: ${persistPath})` : "";
  return tail
    ? `${reason}\n--- final do output ---\n${tail}${log}`
    : `${reason}${log}`;
}

// ── Stream-JSON formatter ──────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const SEP = "─".repeat(50);

function stripAnsi(str) {
  return str.replace(ANSI_RE, "");
}

function formatStreamEvent(event) {
  const parts = [];

  if (event.type === "system" && event.subtype === "init" && event.sessionId) {
    parts.push(`\n┌─[SESSION] ${event.sessionId ?? "?"}`);
    parts.push(`└${SEP}`);
  } else if (
    event.type === "assistant" &&
    Array.isArray(event.message?.content)
  ) {
    for (const block of event.message.content) {
      if (block.type === "thinking") {
        parts.push(`\n┌─[THINKING]`);
        parts.push(block.thinking.trim());
        parts.push(`└${SEP}`);
      } else if (block.type === "text" && block.text?.trim()) {
        parts.push(`\n┌─[TEXT]`);
        parts.push(block.text.trim());
        parts.push(`└${SEP}`);
      } else if (block.type === "tool_use") {
        parts.push(`\n┌─[TOOL] ${block.name}`);
        parts.push(JSON.stringify(block.input, null, 2));
        parts.push(`└${SEP}`);
      }
    }
  } else if (event.type === "user" && Array.isArray(event.message?.content)) {
    for (const block of event.message.content) {
      if (block.type === "tool_result") {
        const raw = Array.isArray(block.content)
          ? block.content.map((c) => c.text ?? "").join("\n")
          : String(block.content ?? "");
        const preview = raw.trim().slice(0, 800);
        parts.push(`\n┌─[TOOL RESULT]`);
        if (preview) parts.push(preview);
        parts.push(`└${SEP}`);
      }
    }
  } else if (event.type === "result") {
    const status = event.is_error ? "ERRO" : "OK";
    const secs = ((event.duration_ms ?? 0) / 1000).toFixed(1);
    const cost =
      event.total_cost_usd != null
        ? `$${event.total_cost_usd.toFixed(4)}`
        : "?";
    // Tokens de entrada somam os de cache (creation/read): é o total que entrou
    // no contexto — mesmo critério da tela /usage.
    const u = event.usage ?? {};
    const fmtTok = (n) =>
      n < 1_000 ? String(n) : n < 1_000_000 ? `${(n / 1_000).toFixed(1)}K` : `${(n / 1_000_000).toFixed(1)}M`;
    const tokens =
      u.input_tokens != null
        ? ` | ↑${fmtTok(u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0))} ↓${fmtTok(u.output_tokens ?? 0)} tokens`
        : "";
    parts.push(
      `\n┌─[RESULTADO] ${status} | ${event.num_turns ?? "?"} turns | ${secs}s | ${cost}${tokens}`,
    );
    if (event.result?.trim()) parts.push(event.result.trim().slice(0, 500));
    parts.push(`└${SEP}`);
  }

  return parts.join("\n");
}

// Tool result de tarefa lançada em background (run_in_background) carrega
// status "async_launched" como campo estruturado. Checagem por campo, não por
// texto: um tool result que só *menciona* a string (ex.: Read de código-fonte)
// não pode disparar.
function contentHasAsyncLaunch(value) {
  if (Array.isArray(value)) return value.some(contentHasAsyncLaunch);
  if (!value || typeof value !== "object") return false;
  if (value.status === "async_launched") return true;
  return Array.isArray(value.content) && contentHasAsyncLaunch(value.content);
}

function eventHasAsyncLaunch(event) {
  if (event.type !== "user" || !Array.isArray(event.message?.content)) return false;
  return event.message.content.some(
    (b) => b.type === "tool_result" && contentHasAsyncLaunch(b.content),
  );
}

function makeLineParser(logStream) {
  let buf = "";
  let sawAsyncLaunch = false;

  function processLine(raw) {
    const stripped = stripAnsi(raw).trim();
    if (!stripped) return;
    try {
      const event = JSON.parse(stripped);
      if (eventHasAsyncLaunch(event)) sawAsyncLaunch = true;
      const formatted = formatStreamEvent(event);
      // Formatted handlers cover the known types; for anything unhandled, log the raw event type
      if (formatted) {
        logStream.write(formatted + "\n");
      } else if (event.type) {
        logStream.write(
          `[${event.type}${event.subtype ? `/${event.subtype}` : ""}]\n`,
        );
      } else {
        logStream.write(raw + "\n");
      }
    } catch {
      logStream.write(raw + "\n");
    }
  }

  return {
    feed(chunk) {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) processLine(line);
    },
    flush() {
      if (buf.trim()) processLine(buf);
      buf = "";
    },
    sawAsyncLaunch: () => sawAsyncLaunch,
  };
}

// ── Claude process helpers ─────────────────────────────────────────────────────

function makeTimeoutMs() {
  const minutes = getConfig().runTimeoutMinutes ?? 30;
  return Math.max(1, minutes) * 60 * 1000;
}

/**
 * Núcleo compartilhado de runClaude/resumeClaude: spawn, log, timeout e parse.
 * @param {Function|null} onSpawn - called with the ChildProcess right after spawn
 */
function execClaude(args, prompt, cwd, logStream, onSpawn, { isResume = false } = {}) {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const child = spawn("claude", args, {
      cwd,
      env: buildChildEnv(),
      shell: isWin,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      // Unix: vira líder do próprio grupo de processos, para o killTree
      // derrubar o claude e toda a descendência (tools, bash, MCP) de uma vez.
      detached: !isWin,
    });

    logStream.write(
      `\n>>> claude ${args.filter((a) => !a.includes("skip")).join(" ")} (pid ${child.pid})\n`,
    );
    logStream.write(`\n┌─[PROMPT]\n${prompt.trim()}\n└${SEP}\n`);
    onSpawn?.(child);

    const parser = makeLineParser(logStream);
    // Timeout por INATIVIDADE, não wall-clock: re-armado a cada chunk de
    // output. Um run que continua emitindo eventos nunca é morto só por rodar
    // longo; um run mudo por runTimeoutMinutes é considerado travado.
    const timeoutMs = makeTimeoutMs();
    let timer = null;
    const armTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        killTree(child);
        const minutes = getConfig().runTimeoutMinutes ?? 30;
        resolve({
          code: 1,
          output,
          error: `Run encerrado por inatividade (${minutes}min sem output)`,
        });
      }, timeoutMs);
    };
    armTimer();

    child.stdout.on("data", (d) => {
      armTimer();
      const t = d.toString();
      output += t;
      parser.feed(t);
    });
    child.stderr.on("data", (d) => {
      armTimer();
      const t = d.toString();
      logStream.write(stripAnsi(t));
      output += t;
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logStream.write(`\n>>> spawn error: ${err.message}\n`);
      resolve({ code: 1, output, error: err.message });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      parser.flush();
      logStream.write(
        `\n>>> process exited (code=${code ?? "null"} signal=${signal ?? "null"})\n`,
      );
      // Tarefa em background morre junto com o processo `claude`; um run que
      // "termina" com trabalho async pendente reportaria sucesso incompleto.
      if (code === 0 && parser.sawAsyncLaunch()) {
        resolve({
          code: 1,
          signal,
          output,
          error:
            "Run lançou tarefa em background (async_launched) e terminou antes de ela concluir",
        });
        return;
      }
      const result = { code, signal, output };
      // Resume de sessão inexistente: sinaliza para o caller poder recriar a
      // sessão em vez de só falhar (ver startRun em agent-runs.runner.js).
      if (isResume && code !== 0 && /no conversation found/i.test(output))
        result.resumeNotFound = true;
      resolve(result);
    });
    child.stdin.end(prompt, "utf-8");
  });
}

export function runClaude(
  prompt,
  cwd,
  logStream,
  sessionName = null,
  onSpawn = null,
  opts = {},
) {
  const { model = null, effort = null, sessionId = null } = opts;
  // --session-id fixa o ID da sessão (resumível por --resume <uuid>); -n define
  // só um nome de exibição. Fluxos de worktree usam -n; a criação de skill passa
  // um UUID via opts.sessionId para poder retomar a conversa depois.
  const sessionArgs = sessionId
    ? ["--session-id", sessionId]
    : sessionName
      ? ["-n", sessionName]
      : [];
  const args = [
    ...sessionArgs,
    ...(model ? ["--model", model] : []),
    ...(effort ? ["--effort", effort] : []),
    ...denyArgs,
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];
  return execClaude(args, prompt, cwd, logStream, onSpawn);
}

export function resumeClaude(
  prompt,
  cwd,
  logStream,
  sessionName,
  onSpawn = null,
  opts = {},
) {
  const { model = null, effort = null } = opts;
  const args = [
    "--resume",
    sessionName,
    ...(model ? ["--model", model] : []),
    ...(effort ? ["--effort", effort] : []),
    ...denyArgs,
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];
  return execClaude(args, prompt, cwd, logStream, onSpawn, { isResume: true });
}
