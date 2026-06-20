import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function checkSkill(name) {
  const base = join(homedir(), ".claude", "skills");
  return existsSync(join(base, name)) ||
         existsSync(join(base, `${name}.md`));
}

export async function getStatus() {
  try {
    const version = execSync("claude --version", {
      stdio: "pipe", encoding: "utf-8", timeout: 5000,
    }).trim();
    return {
      connected: true,
      method: "claude-cli",
      version,
      tlcSkill: checkSkill("tlc-spec-driven"),
      specDrivenEvalSkill: checkSkill("spec-driven-eval"),
    };
  } catch {
    return { connected: false, tlcSkill: false, specDrivenEvalSkill: false };
  }
}
