import { execSync } from "child_process";

export async function getStatus() {
  try {
    const version = execSync("claude --version", {
      stdio: "pipe", encoding: "utf-8", timeout: 5000,
    }).trim();
    return { connected: true, method: "claude-cli", version };
  } catch {
    return { connected: false };
  }
}
