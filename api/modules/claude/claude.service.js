import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function checkTlcSkill() {
  const base = join(homedir(), ".claude", "skills");
  return existsSync(join(base, "tlc-spec-driven")) ||
         existsSync(join(base, "tlc-spec-driven.md"));
}

export async function getStatus() {
  try {
    const version = execSync("claude --version", {
      stdio: "pipe", encoding: "utf-8", timeout: 5000,
    }).trim();
    return { connected: true, method: "claude-cli", version, tlcSkill: checkTlcSkill() };
  } catch {
    return { connected: false, tlcSkill: false };
  }
}
