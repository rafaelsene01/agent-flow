import fs from "fs";
import path from "path";
import { zipSync, unzipSync } from "fflate";
import { PACKAGE_ROOT } from "../../paths.js";

// Skills locais do projeto: <pacote>/.claude/skills (mesma pasta usada por skills.service).
const SKILLS_DIR = path.join(PACKAGE_ROOT, ".claude", "skills");

// Nome de skill válido (kebab-case). Também vira o nome da pasta em disco.
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

// Coleta recursivamente todos os arquivos de um diretório como pares
// { <caminho relativo com "/">: Buffer }. Segue o layout esperado pelo fflate.
function readDirFiles(dir, base = "") {
  const out = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (fs.statSync(full).isDirectory()) {
      Object.assign(out, readDirFiles(full, rel));
    } else {
      out[rel] = fs.readFileSync(full);
    }
  }
  return out;
}

// Deriva o nome da skill a partir do frontmatter `name:` do SKILL.md, com fallback
// para o basename informado. Sempre normaliza para kebab-case validável.
function deriveSkillName(content, fallback) {
  const fm = String(content ?? "").match(/^name:\s*(.+)$/m);
  const raw = (fm ? fm[1] : fallback ?? "").trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!NAME_RE.test(clean)) {
    throw new Error("Não foi possível determinar um nome de skill válido no pacote.");
  }
  return clean;
}

// Empacota uma skill como zip da pasta. O SKILL.md vai para a raiz do zip renomeado
// para `<nome>.skill` (o marcador exigido no import); os demais arquivos entram com
// o caminho relativo preservado. Skill de arquivo avulso (<nome>.md) vira só o .skill.
export function exportSkill(name) {
  if (!NAME_RE.test(name)) throw new Error("Nome inválido.");
  const dir = path.join(SKILLS_DIR, name);
  const dirSkill = path.join(dir, "SKILL.md");
  const flatFile = path.join(SKILLS_DIR, `${name}.md`);

  const files = {};
  if (fs.existsSync(dirSkill)) {
    const all = readDirFiles(dir);
    for (const [rel, buf] of Object.entries(all)) {
      // O SKILL.md da raiz da pasta vira o marcador <nome>.skill.
      if (rel === "SKILL.md") files[`${name}.skill`] = buf;
      else files[rel] = buf;
    }
  } else if (fs.existsSync(flatFile)) {
    files[`${name}.skill`] = fs.readFileSync(flatFile);
  } else {
    throw new Error("Skill não encontrada.");
  }

  const zipped = zipSync(files, { level: 6 });
  return { filename: `${name}.zip`, buffer: Buffer.from(zipped) };
}

// Grava a skill em disco a partir das entradas resolvidas. `skillContent` é o
// conteúdo do SKILL.md; `resources` são os demais arquivos { relpath: Buffer }.
// Recusa sobrescrever uma skill já existente.
function writeSkill(name, skillContent, resources) {
  const dir = path.join(SKILLS_DIR, name);
  if (fs.existsSync(dir) || fs.existsSync(path.join(SKILLS_DIR, `${name}.md`))) {
    throw new Error(`Já existe uma skill chamada "${name}".`);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), skillContent);
  for (const [rel, buf] of Object.entries(resources)) {
    // Defesa contra path traversal em zips maliciosos: resolve dentro da pasta.
    const dest = path.join(dir, rel);
    if (!dest.startsWith(dir + path.sep)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }
  return { name, path: path.join(dir, "SKILL.md") };
}

// Assinatura de um arquivo zip: "PK\x03\x04" (local file header) ou, para um zip
// vazio, "PK\x05\x06" (end of central directory). Detecta o formato pelo conteúdo
// em vez da extensão — o arquivo pode chegar como .skill, .zip ou sem extensão.
function isZip(buffer) {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06)
  );
}

// Import de um pacote de zip de skill, em dois layouts:
//   * export do agent-flow: um <algo>.skill na RAIZ (vira o SKILL.md);
//   * pacote do Claude: um SKILL.md (na raiz ou dentro de uma única pasta,
//     ex.: `card-description-writer/SKILL.md`).
// Os demais arquivos entram como recursos, com o prefixo da pasta da skill
// removido para não aninhar `<nome>/<nome>/...`.
function importZip(buffer) {
  let entries;
  try {
    entries = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error("Arquivo .zip inválido ou corrompido.");
  }
  // Descarta diretórios e lixo de SO.
  const files = {};
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/")) continue; // entrada de diretório
    if (name.startsWith("__MACOSX/") || path.basename(name) === ".DS_Store") continue;
    files[name] = data;
  }

  // Localiza o marcador da skill. Formato agent-flow: um <algo>.skill na raiz.
  // Formato Claude: o SKILL.md mais raso do pacote.
  let skillPath = Object.keys(files).find((n) => /^[^/]+\.skill$/.test(n));
  if (!skillPath) {
    skillPath = Object.keys(files)
      .filter((n) => path.basename(n) === "SKILL.md")
      .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  }
  if (!skillPath) {
    throw new Error("O .zip não contém um SKILL.md nem um arquivo .skill — import cancelado.");
  }

  const content = Buffer.from(files[skillPath]).toString("utf-8");
  if (!content.trim()) throw new Error("O SKILL.md do pacote está vazio.");

  // Prefixo da pasta que contém o marcador (ex.: "card-description-writer/"),
  // usado para derivar o nome e desaninhar os recursos.
  const slash = skillPath.lastIndexOf("/");
  const prefix = slash === -1 ? "" : skillPath.slice(0, slash + 1);
  const folderName = prefix
    ? prefix.replace(/\/$/, "").split("/").pop()
    : path.basename(skillPath, path.extname(skillPath));
  const name = deriveSkillName(content, folderName);

  // Recursos = todo o resto. Remove o prefixo da pasta da skill; arquivos fora
  // dela (quando a skill está aninhada) são ignorados.
  const resources = {};
  for (const [rel, data] of Object.entries(files)) {
    if (rel === skillPath) continue;
    let out = rel;
    if (prefix) {
      if (!rel.startsWith(prefix)) continue;
      out = rel.slice(prefix.length);
    }
    if (!out) continue;
    resources[out] = Buffer.from(data);
  }
  return writeSkill(name, content, resources);
}

// Import de uma skill. O formato é decidido pelo CONTEÚDO, não pela extensão:
//  - bytes de zip (magic "PK") → pacote (.zip do agent-flow ou do Claude);
//  - senão → texto avulso (o próprio SKILL.md, tipicamente um .skill).
// O nome deriva do frontmatter `name:` (fallback: pasta/basename do arquivo).
export function importSkill(filename, buffer) {
  if (isZip(buffer)) return importZip(buffer);

  const content = buffer.toString("utf-8");
  if (!content.trim()) throw new Error("Arquivo de skill vazio.");
  const base = path.basename(filename || "", path.extname(filename || ""));
  const name = deriveSkillName(content, base);
  return writeSkill(name, content, {});
}
