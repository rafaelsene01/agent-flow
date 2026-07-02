import { existsSync, readFileSync, readdirSync, statSync } from "fs";
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
    const ea = readdirSync(a).sort();
    const eb = readdirSync(b).sort();
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
// A comparação usa a versão do projeto (<cwd>/.claude/skills/<name>) como origem,
// que é exatamente a listada na tela.
export function getInstallState(name) {
  const cfg = INSTALLABLE_SKILLS[name];
  const kind = cfg?.kind ?? "Skill";

  const globalPath = skillTarget(globalSkillsDir(), name);
  if (!globalPath) {
    return { installable: true, installed: false, upToDate: false, kind };
  }

  const projectPath = skillTarget(projectSkillsDir(), name);
  let upToDate = false;
  try {
    upToDate = projectPath ? pathsEqual(projectPath, globalPath) : false;
  } catch {
    // symlink quebrado, permissão, etc. → trata como "há algo a atualizar"
    upToDate = false;
  }
  return { installable: true, installed: true, upToDate, kind };
}
