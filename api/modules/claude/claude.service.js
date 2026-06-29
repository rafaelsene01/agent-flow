import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function checkSkill(name) {
  const base = join(homedir(), ".claude", "skills");
  return existsSync(join(base, name)) ||
         existsSync(join(base, `${name}.md`));
}

// Plugins ficam registrados em ~/.claude/settings.json → enabledPlugins.
function checkPlugin(id) {
  try {
    const raw = readFileSync(join(homedir(), ".claude", "settings.json"), "utf-8");
    return JSON.parse(raw).enabledPlugins?.[id] === true;
  } catch {
    return false;
  }
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
      karpathyPlugin: checkPlugin("andrej-karpathy-skills@karpathy-skills"),
      cavemanSkill: checkSkill("caveman"),
    };
  } catch {
    return { connected: false, tlcSkill: false, specDrivenEvalSkill: false, karpathyPlugin: false, cavemanSkill: false };
  }
}
