import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { getConfig } from "../config/config.service.js";

const LOGS_DIR = path.join(os.homedir(), ".agent-flow", "logs");
const isWin = process.platform === "win32";

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
}

// ── Log streams ────────────────────────────────────────────────────────────────

export function createRunLog(wt, name) {
  activeRuns.add(wt.id);
  logBuffers.set(wt.id, "");
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const persistPath = path.join(LOGS_DIR, `${path.basename(wt.path)}-${name}`);
  const streams = [
    fs.createWriteStream(path.join(wt.path, name), {
      flags: "w",
      encoding: "utf-8",
    }),
    fs.createWriteStream(persistPath, { flags: "w", encoding: "utf-8" }),
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

  if (event.type === "system" && event.subtype === "init") {
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
    parts.push(
      `\n┌─[RESULTADO] ${status} | ${event.num_turns ?? "?"} turns | ${secs}s | ${cost}`,
    );
    if (event.result?.trim()) parts.push(event.result.trim().slice(0, 500));
    parts.push(`└${SEP}`);
  }

  return parts.join("\n");
}

function makeLineParser(logStream) {
  let buf = "";

  function processLine(raw) {
    const stripped = stripAnsi(raw).trim();
    if (!stripped) return;
    try {
      const event = JSON.parse(stripped);
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
  };
}

// ── Claude process helpers ─────────────────────────────────────────────────────

function makeTimeoutMs() {
  const minutes = getConfig().runTimeoutMinutes ?? 30;
  return Math.max(1, minutes) * 60 * 1000;
}

/**
 * @param {Function|null} onSpawn - called with the ChildProcess right after spawn
 */
export function runClaude(
  prompt,
  cwd,
  logStream,
  sessionName = null,
  onSpawn = null,
) {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const baseArgs = [
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ];
    const args = sessionName ? ["-n", sessionName, ...baseArgs] : baseArgs;
    const child = spawn("claude", args, {
      cwd,
      shell: isWin,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    logStream.write(
      `\n>>> claude ${args.filter((a) => !a.includes("skip")).join(" ")} (pid ${child.pid})\n`,
    );
    onSpawn?.(child);

    const parser = makeLineParser(logStream);
    const timeoutMs = makeTimeoutMs();
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      const minutes = getConfig().runTimeoutMinutes ?? 30;
      resolve({
        code: 1,
        output,
        error: `Run encerrado por timeout (${minutes}min)`,
      });
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      const t = d.toString();
      output += t;
      parser.feed(t);
    });
    child.stderr.on("data", (d) => {
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
      resolve({ code, signal, output });
    });
    child.stdin.end(prompt, "utf-8");
  });
}

export function resumeClaude(
  prompt,
  cwd,
  logStream,
  sessionName,
  onSpawn = null,
) {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const child = spawn(
      "claude",
      [
        "--resume",
        sessionName,
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
      ],
      { cwd, shell: isWin, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );

    logStream.write(
      `\n>>> claude --resume ${sessionName} --output-format stream-json --verbose (pid ${child.pid})\n`,
    );
    onSpawn?.(child);

    const parser = makeLineParser(logStream);
    const timeoutMs = makeTimeoutMs();
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      const minutes = getConfig().runTimeoutMinutes ?? 30;
      resolve({
        code: 1,
        output,
        error: `Run encerrado por timeout (${minutes}min)`,
      });
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      const t = d.toString();
      output += t;
      parser.feed(t);
    });
    child.stderr.on("data", (d) => {
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
      resolve({ code, signal, output });
    });
    child.stdin.end(prompt, "utf-8");
  });
}
