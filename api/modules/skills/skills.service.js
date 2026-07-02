import fs from "fs";
import path from "path";
import { getConfig, setConfig } from "../config/config.service.js";
import { getInstallState } from "./installable.js";

// Skills locais do projeto: <cwd>/.claude/skills (onde o agent-flow está rodando),
// e não as globais em ~/.claude/skills.
const SKILLS_DIR = path.join(process.cwd(), ".claude", "skills");

// Resolve o arquivo de definição de uma skill: subdiretório com SKILL.md ou <nome>.md avulso.
function skillFilePath(name) {
  const dirFile = path.join(SKILLS_DIR, name, "SKILL.md");
  if (fs.existsSync(dirFile)) return dirFile;
  const flatFile = path.join(SKILLS_DIR, `${name}.md`);
  if (fs.existsSync(flatFile)) return flatFile;
  return null;
}

// Parser mínimo de frontmatter: extrai `description` do bloco `---`.
// Suporta valor inline e escalar dobrado/literal (`description: >` ou `|` seguido de linhas indentadas).
function parseDescription(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return "";
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const inline = lines[i].match(/^description:\s*(.*)$/);
    if (!inline) continue;
    const val = inline[1].trim();
    if (val && val !== ">" && val !== "|") return val;
    // Escalar multi-linha: junta as linhas indentadas seguintes.
    const folded = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s+\S/.test(lines[j])) folded.push(lines[j].trim());
      else break;
    }
    return folded.join(" ");
  }
  return "";
}

// R1: descobre skills em ~/.claude/skills. Diretório ausente → [] (sem erro).
export function listSkills() {
  let entries;
  try {
    entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills = [];
  for (const e of entries) {
    // existsSync/statSync seguem symlinks — skills podem ser junctions no Windows,
    // então não dá para confiar em Dirent.isDirectory()/isFile().
    const full = path.join(SKILLS_DIR, e.name);
    let name = null;
    if (fs.existsSync(path.join(full, "SKILL.md"))) {
      name = e.name; // subdiretório (ou symlink p/ dir) com SKILL.md
    } else if (e.name.endsWith(".md") && fs.statSync(full).isFile()) {
      name = e.name.slice(0, -3); // arquivo .md avulso
    }
    if (!name) continue;
    const filePath = skillFilePath(name);
    let description = "";
    try {
      description = parseDescription(fs.readFileSync(filePath, "utf-8"));
    } catch {}
    skills.push({ name, description, path: filePath });
  }
  return skills;
}

// R2: estado de ativação persistido em config.json → activeSkills (default []).
export function getActiveSkillNames() {
  return getConfig().activeSkills ?? [];
}

export async function setSkillActive(name, active) {
  const current = getConfig().activeSkills ?? [];
  const next = active
    ? [...new Set([...current, name])]
    : current.filter((n) => n !== name);
  await setConfig({ activeSkills: next });
  return next;
}

// R3: descoberta + estado (para a tela de skills). Além do estado de ativação,
// anexa o estado de instalação global (installed/installable/kind) para a UI
// oferecer o botão de instalar diretamente no card da skill.
export function getSkills() {
  const active = new Set(getActiveSkillNames());
  return listSkills().map((s) => ({
    ...s,
    active: active.has(s.name),
    ...getInstallState(s.name),
  }));
}

// Conteúdo bruto da SKILL.md de uma skill (para edição na UI).
export function getSkillContent(name) {
  const file = skillFilePath(name);
  if (!file) throw new Error("Skill não encontrada.");
  return fs.readFileSync(file, "utf-8");
}

// Sobrescreve o conteúdo da SKILL.md existente. Segue junction/symlink (edita o alvo).
export function updateSkillContent(name, content) {
  const file = skillFilePath(name);
  if (!file) throw new Error("Skill não encontrada.");
  if (typeof content !== "string") throw new Error("Conteúdo inválido.");
  fs.writeFileSync(file, content, "utf-8");
  return { name, path: file };
}

// Remove a skill do projeto (subdiretório <name>/ ou arquivo avulso <name>.md) e
// tira o nome de activeSkills. Para junction/symlink, remove só o vínculo.
export async function deleteSkill(name) {
  const dirPath = path.join(SKILLS_DIR, name);
  const flatPath = path.join(SKILLS_DIR, `${name}.md`);
  let target = null;
  if (fs.existsSync(path.join(dirPath, "SKILL.md"))) target = dirPath;
  else if (fs.existsSync(flatPath)) target = flatPath;
  if (!target) throw new Error("Skill não encontrada.");

  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    // junction/symlink: remove apenas o vínculo, nunca o destino
    try {
      fs.unlinkSync(target);
    } catch {
      fs.rmSync(target, { recursive: false, force: true });
    }
  } else {
    fs.rmSync(target, { recursive: true, force: true });
  }

  const current = getConfig().activeSkills ?? [];
  if (current.includes(name)) {
    await setConfig({ activeSkills: current.filter((n) => n !== name) });
  }
}

// R5: apenas as skills ativas, com o conteúdo bruto pronto para injeção futura em prompt.
// NÃO é consumido por nenhum fluxo hoje — criado para uso posterior.
export function getActiveSkills() {
  const active = new Set(getActiveSkillNames());
  return listSkills()
    .filter((s) => active.has(s.name))
    .map((s) => {
      let content = "";
      try {
        content = fs.readFileSync(s.path, "utf-8");
      } catch {}
      return { name: s.name, description: s.description, path: s.path, content };
    });
}

// Resolve o conteúdo bruto de skills por nome, preservando a ordem dos nomes
// informados. Nomes desconhecidos são ignorados. Usado para injetar as skills
// linkadas a um agent no prompt final.
export function getSkillsContent(names) {
  const byName = new Map(listSkills().map((s) => [s.name, s]));
  const out = [];
  for (const name of names ?? []) {
    const s = byName.get(name);
    if (!s) continue;
    let content = "";
    try {
      content = fs.readFileSync(s.path, "utf-8");
    } catch {}
    out.push({ name: s.name, description: s.description, path: s.path, content });
  }
  return out;
}
