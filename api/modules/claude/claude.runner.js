import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const LOGS_DIR = path.join(os.homedir(), ".agent-flow", "logs");
const isWin = process.platform === "win32";

export function createRunLog(wt, name) {
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

export function failureDetail(result, persistPath) {
  const reason = result.error ?? (result.signal ? `signal ${result.signal}` : `exit code ${result.code}`);
  const tail = result.output.trim().slice(-500);
  const log = persistPath ? `\n(log completo: ${persistPath})` : "";
  return tail ? `${reason}\n--- final do output ---\n${tail}${log}` : `${reason}${log}`;
}

export function runClaude(prompt, cwd, logStream, sessionName = null) {
  return new Promise((resolve) => {
    let output = "";
    const args = sessionName
      ? ["-n", sessionName, "--dangerously-skip-permissions"]
      : ["--dangerously-skip-permissions"];
    const child = spawn("claude", args, { cwd, shell: isWin, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.on("data", (d) => { const t = d.toString(); logStream.write(t); output += t; });
    child.stderr.on("data", (d) => { const t = d.toString(); logStream.write(t); output += t; });
    child.on("error",  (err)          => resolve({ code: 1, output, error: err.message }));
    child.on("close",  (code, signal) => resolve({ code, signal, output }));
    child.stdin.end(prompt, "utf-8");
  });
}

export function resumeClaude(prompt, cwd, logStream, sessionName) {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(
      "claude",
      ["--resume", sessionName, "--dangerously-skip-permissions"],
      { cwd, shell: isWin, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    child.stdout.on("data", (d) => { const t = d.toString(); logStream.write(t); output += t; });
    child.stderr.on("data", (d) => { const t = d.toString(); logStream.write(t); output += t; });
    child.on("error",  (err)          => resolve({ code: 1, output, error: err.message }));
    child.on("close",  (code, signal) => resolve({ code, signal, output }));
    child.stdin.end(prompt, "utf-8");
  });
}
