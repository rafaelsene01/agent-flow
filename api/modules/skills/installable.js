import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { PACKAGE_ROOT } from "../../paths.js";

// Metadado gravado pelo runtime do Claude Code após a instalação (hash +
// timestamp). Não faz parte do conteúdo da skill, então é ignorado na
// comparação — senão skills locais acusariam "atualizar" para sempre.
const RUNTIME_META = ".skill-meta.json";

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

// Resolve o alvo de uma skill num diretório de skills: subdiretório <name>/ ou
// arquivo avulso <name>.md. Segue symlink/junction (existsSync segue o link).
function skillTarget(base, name) {
  const dir = join(base, name);
  if (existsSync(dir)) return dir;
  const flat = join(base, `${name}.md`);
  if (existsSync(flat)) return flat;
  return null;
}

const globalSkillsDir = () => join(homedir(), ".claude", "skills");
const projectSkillsDir = () => join(process.cwd(), ".claude", "skills");

// Compara dois caminhos (arquivo ou diretório) byte a byte, recursivamente.
// Diretórios só são iguais com o mesmo conjunto de nomes e conteúdo idêntico —
// arquivo extra/ausente (ex.: .skill-meta.json só no global) conta como diferença.
// statSync segue symlink, então o alvo global linkado é comparado pelo destino.
function pathsEqual(a, b) {
  const sa = statSync(a);
  const sb = statSync(b);
  if (sa.isFile() && sb.isFile()) {
    return readFileSync(a).equals(readFileSync(b));
  }
  if (sa.isDirectory() && sb.isDirectory()) {
    const ea = readdirSync(a).filter((n) => n !== RUNTIME_META).sort();
    const eb = readdirSync(b).filter((n) => n !== RUNTIME_META).sort();
    if (ea.length !== eb.length) return false;
    if (ea.some((n, i) => n !== eb[i])) return false;
    return ea.every((n) => pathsEqual(join(a, n), join(b, n)));
  }
  return false; // tipos diferentes
}

// Estado de instalação global de uma skill, derivado só do filesystem (sem ler
// config). Escaneia ~/.claude/skills pelo nome:
//   - ausente             → installed:false            → UI mostra "Instalar"
//   - presente e difere    → installed:true, upToDate:false → "Atualizar" (habilitado)
//   - presente e idêntico  → installed:true, upToDate:true  → "Atualizar" (desabilitado)
// A origem da comparação deve ser a MESMA que o instalador (status.js) usa por
// tipo — senão a skill acusa "atualizar" para sempre:
//   - git/plugin → origem é remota (repo/CLI), não comparável byte-a-byte
//     localmente (ex.: caveman traz README.md só no repo). Instalada ⇒ atual.
//   - local      → origem é o pacote (PACKAGE_ROOT/.claude/skills), não o cwd.
//   - genérica   → cópia do projeto (<cwd>/.claude/skills/<name>).
export function getInstallState(name) {
  const cfg = INSTALLABLE_SKILLS[name];
  const kind = cfg?.kind ?? "Skill";

  const globalPath = skillTarget(globalSkillsDir(), name);
  if (!globalPath) {
    return { installable: true, installed: false, upToDate: false, kind };
  }

  // Sem origem local comparável: presença global já significa instalada e atual.
  if (cfg?.type === "git" || cfg?.type === "plugin") {
    return { installable: true, installed: true, upToDate: true, kind };
  }

  const srcBase = cfg?.type === "local"
    ? join(PACKAGE_ROOT, ".claude", "skills")
    : projectSkillsDir();
  const sourcePath = skillTarget(srcBase, name);
  let upToDate = false;
  try {
    upToDate = sourcePath ? pathsEqual(sourcePath, globalPath) : false;
  } catch {
    // symlink quebrado, permissão, etc. → trata como "há algo a atualizar"
    upToDate = false;
  }
  return { installable: true, installed: true, upToDate, kind };
}
