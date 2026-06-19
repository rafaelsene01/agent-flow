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

export function registerSseClient(id, res) {
  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id).add(res);

  // replay do conteúdo já acumulado para o novo cliente
  const buffered = logBuffers.get(id);
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
    const args = sessionName
      ? ["-n", sessionName, "--dangerously-skip-permissions"]
      : ["--dangerously-skip-permissions"];
    const child = spawn("claude", args, {
      cwd,
      shell: isWin,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    onSpawn?.(child);

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
      logStream.write(t);
      output += t;
    });
    child.stderr.on("data", (d) => {
      const t = d.toString();
      logStream.write(t);
      output += t;
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: 1, output, error: err.message });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
      ["--resume", sessionName, "--dangerously-skip-permissions"],
      { cwd, shell: isWin, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );

    onSpawn?.(child);

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
      logStream.write(t);
      output += t;
    });
    child.stderr.on("data", (d) => {
      const t = d.toString();
      logStream.write(t);
      output += t;
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: 1, output, error: err.message });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, output });
    });
    child.stdin.end(prompt, "utf-8");
  });
}
