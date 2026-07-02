import fs from "fs";
import path from "path";
import { runClaude, resumeClaude, failureDetail } from "../claude/claude.runner.js";
import { getLanguage } from "../config/config.service.js";

// Skills locais do projeto: <cwd>/.claude/skills (mesma pasta usada por skills.service).
const SKILLS_DIR = path.join(process.cwd(), ".claude", "skills");

// A conversa de criação de skill não pertence a nenhuma worktree, então não há
// log persistido — passamos um logStream no-op para runClaude/resumeClaude.
const NOOP_LOG = { write() {}, persistPath: null };

function langLine() {
  return getLanguage() === "pt"
    ? "Converse em português do Brasil."
    : "Converse in English.";
}

// Lembrete do protocolo enviado a cada turno de resume (barato e mantém o Claude
// preso ao formato JSON mesmo em conversas longas).
const TURN_REMINDER =
  "Continue a entrevista seguindo o PROTOCOLO DE RESPOSTA: para perguntar, termine com " +
  "um bloco ```json (uma pergunta por vez); quando a SKILL.md estiver pronta, use a linha " +
  "SKILL_COMPLETE e o bloco ```skill-md.";

// Preâmbulo completo enviado apenas no primeiro turno da sessão.
function buildPreamble() {
  return [
    "Você é um assistente que cria uma Skill do Claude junto com o usuário, no estilo do skill-creator.",
    "Faça uma entrevista objetiva, UMA pergunta por vez, para descobrir:",
    "- o que a skill deve permitir o Claude fazer;",
    "- quando ela deve disparar (frases/contextos do usuário) — isso vira o campo `description`;",
    "- o formato de saída esperado;",
    "- passos principais, exemplos e casos de borda relevantes.",
    "",
    "Regras importantes:",
    "- NÃO use ferramentas, NÃO rode subagentes, NÃO rode evals, NÃO abra navegador, NÃO escreva arquivos. Apenas converse.",
    "- Faça UMA pergunta por vez, indo fundo o suficiente para escrever uma boa SKILL.md sem cansar o usuário.",
    "- Quando tiver informação suficiente (ou quando o usuário pedir para finalizar), gere a SKILL.md completa.",
    "",
    langLine(),
    "",
    "PROTOCOLO DE RESPOSTA (obrigatório):",
    "",
    "Para PERGUNTAR — termine com exatamente UM bloco ```json:",
    "```json",
    '{"type":"question","question":"sua pergunta","options":["sugestão 1","sugestão 2"]}',
    "```",
    '"options": de 0 a 6 respostas sugeridas curtas (pode ser lista vazia []). O usuário pode escolher uma OU digitar texto livre.',
    "",
    "Para ENTREGAR a skill pronta — NÃO use json. Escreva a linha `SKILL_COMPLETE: <nome-em-kebab-case>`,",
    "depois uma linha com o marcador `<<<SKILL_MD>>>`, depois o conteúdo COMPLETO da SKILL.md (frontmatter",
    "--- com name e description --- e o corpo em markdown, podendo conter blocos ``` à vontade), e por fim",
    "uma linha com o marcador `<<<END_SKILL_MD>>>`. Exemplo:",
    "SKILL_COMPLETE: minha-skill",
    "<<<SKILL_MD>>>",
    "---",
    "name: minha-skill",
    "description: ...",
    "---",
    "",
    "# Minha Skill",
    "...",
    "<<<END_SKILL_MD>>>",
    "",
    "Numa mesma resposta, use apenas UM dos dois formatos (pergunta OU entrega).",
  ].join("\n");
}

// Extrai o texto final da resposta do Claude a partir do stdout raw (stream-json).
function extractFinalText(rawOutput) {
  let finalText = "";
  for (const line of (rawOutput ?? "").split("\n")) {
    const s = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
    if (!s) continue;
    try {
      const ev = JSON.parse(s);
      if (ev.type === "result" && typeof ev.result === "string") {
        finalText = ev.result;
      } else if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
        for (const block of ev.message.content) {
          if (block.type === "text" && block.text?.trim()) finalText = block.text;
        }
      }
    } catch {
      // linha não-JSON (ex: stderr concatenado) — ignora
    }
  }
  return finalText;
}

// Extrai o conteúdo da SKILL.md entre os marcadores sentinela. Usa marcadores em
// vez de fence porque a própria SKILL.md costuma conter blocos ``` internos.
function extractSkillMd(text) {
  const m = (text ?? "").match(/<<<SKILL_MD>>>\r?\n([\s\S]*?)\r?\n<<<END_SKILL_MD>>>/);
  return m ? m[1] : null;
}

// Pega o último bloco ```json que faça parse como JSON.
function extractJsonBlock(text) {
  const fences = [...(text ?? "").matchAll(/```json\s*([\s\S]*?)```/gi)];
  for (let i = fences.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(fences[i][1].trim());
    } catch {
      // fence não-JSON — tenta o próximo
    }
  }
  return null;
}

// Deriva o nome da skill: linha SKILL_COMPLETE, senão frontmatter `name:`.
function deriveName(finalText, content) {
  const marker = (finalText ?? "").match(/^SKILL_COMPLETE:\s*(.+)$/m);
  if (marker) return marker[1].trim();
  const fm = (content ?? "").match(/^name:\s*(.+)$/m);
  return fm ? fm[1].trim() : "";
}

// Normaliza a resposta do Claude no protocolo { type: "question" | "complete" }.
// A entrega vem entre marcadores <<<SKILL_MD>>> (evita escapar markdown multi-linha
// e é imune a blocos ``` internos); a pergunta usa um bloco ```json. Se nada casar,
// degrada para uma pergunta com o texto inteiro (mantém o fluxo vivo).
export function parseCreatorResponse(finalText) {
  const skillMd = extractSkillMd(finalText);
  if (skillMd && skillMd.trim()) {
    const content = skillMd.replace(/\s+$/, "");
    return { type: "complete", name: deriveName(finalText, content), content };
  }

  const parsed = extractJsonBlock(finalText);
  if (parsed?.type === "question") {
    return {
      type: "question",
      question: typeof parsed.question === "string" ? parsed.question : "",
      options: Array.isArray(parsed.options)
        ? parsed.options.slice(0, 6).map((o) => String(o))
        : [],
    };
  }

  return {
    type: "question",
    question: (finalText ?? "").trim() || "Pode detalhar um pouco mais?",
    options: [],
  };
}

// Roda um turno da conversa de criação de skill. Primeiro turno usa runClaude
// (com -n <sessionId>); os seguintes usam resumeClaude (--resume <sessionId>).
export async function runCreatorTurn({ sessionId, prompt, started, model, effort }) {
  const first = !started;
  const fullPrompt = first
    ? buildPreamble() + "\n\nPedido inicial do usuário:\n" + prompt.trim()
    : "Resposta/instrução do usuário:\n" + prompt.trim() + "\n\n" + TURN_REMINDER;

  const opts = { model: model || "sonnet", effort: effort || "medium" };
  // Primeiro turno: cria a sessão com --session-id <uuid> (via opts.sessionId).
  // Turnos seguintes: --resume <uuid> encontra a conversa por esse mesmo ID.
  const result = first
    ? await runClaude(fullPrompt, process.cwd(), NOOP_LOG, null, null, { ...opts, sessionId })
    : await resumeClaude(fullPrompt, process.cwd(), NOOP_LOG, sessionId, null, opts);

  if (result.code !== 0) {
    throw new Error(`Claude falhou: ${failureDetail(result, null)}`);
  }
  return parseCreatorResponse(extractFinalText(result.output));
}

// Persiste a skill em <cwd>/.claude/skills/<name>/SKILL.md. Recusa nomes inválidos,
// conteúdo vazio e sobrescrita de uma skill já existente.
export function saveSkill(name, content) {
  const clean = String(name ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(clean)) {
    throw new Error("Nome inválido: use apenas letras minúsculas, números e hífens.");
  }
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Conteúdo da skill vazio.");
  }
  const dir = path.join(SKILLS_DIR, clean);
  const file = path.join(dir, "SKILL.md");
  if (fs.existsSync(file)) {
    throw new Error(`Já existe uma skill chamada "${clean}".`);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, content, "utf-8");
  return { name: clean, path: file };
}
