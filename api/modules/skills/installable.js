import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Skills/plugins que o agent-flow sabe instalar globalmente (~/.claude).
// type: "local" copia de dentro do projeto; "git" clona um repo remoto e copia
// o subdiretório indicado; "plugin" instala via CLI do Claude Code
// (marketplace + plugin), ficando disponível em todos os projetos.
export const INSTALLABLE_SKILLS = {
  "tlc-spec-driven":  { type: "local", kind: "Skill" },
  "spec-driven-eval": { type: "local", kind: "Skill" },
  "karpathy-guidelines": {
    type: "plugin",
    kind: "Plugin",
    marketplace: "forrestchang/andrej-karpathy-skills",
    plugin: "andrej-karpathy-skills@karpathy-skills",
  },
  "caveman": {
    type: "git",
    kind: "Skill",
    repo: "https://github.com/juliusbrussee/caveman.git",
    subdir: join("skills", "caveman"),
  },
};

// Skill instalada globalmente: diretório ou arquivo avulso em ~/.claude/skills.
function skillInstalled(name) {
  const base = join(homedir(), ".claude", "skills");
  return existsSync(join(base, name)) || existsSync(join(base, `${name}.md`));
}

// Plugin habilitado em ~/.claude/settings.json → enabledPlugins.
function pluginInstalled(id) {
  try {
    const raw = readFileSync(join(homedir(), ".claude", "settings.json"), "utf-8");
    return JSON.parse(raw).enabledPlugins?.[id] === true;
  } catch {
    return false;
  }
}

// Estado de instalação global de uma skill listada. Skills fora do catálogo
// INSTALLABLE_SKILLS não são instaláveis pela UI (installable: false).
export function getInstallState(name) {
  const cfg = INSTALLABLE_SKILLS[name];
  if (!cfg) return { installable: false, installed: false, kind: "Skill" };
  const installed = cfg.type === "plugin"
    ? pluginInstalled(cfg.plugin)
    : skillInstalled(name);
  return { installable: true, installed, kind: cfg.kind };
}
