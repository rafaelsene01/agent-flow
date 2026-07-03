import { runClaude, resumeClaude, failureDetail } from "../claude/claude.runner.js";
import { getLanguage } from "../config/config.service.js";

// A conversa de criação de prompt não pertence a nenhuma worktree, então não há
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
  "um bloco ```json (uma pergunta por vez); quando o prompt do agent estiver pronto, use a linha " +
  "AGENT_PROMPT_COMPLETE e o bloco de marcadores.";

// Preâmbulo completo enviado apenas no primeiro turno da sessão.
function buildPreamble() {
  return [
    "Você é um assistente que ajuda a escrever o PROMPT (instruções base) de um agent autônomo " +
      "de coding deste board, junto com o usuário.",
    "Faça uma entrevista objetiva, UMA pergunta por vez, para descobrir:",
    "- o papel/objetivo do agent (o que ele deve fazer ao rodar sobre um card do board);",
    "- o escopo e os limites (o que ele NÃO deve fazer, quando deve parar e perguntar);",
    "- o formato/estilo esperado do resultado (ex.: só código, só análise, sempre revisar antes de X);",
    "- passos, convenções ou ferramentas específicas que deve seguir.",
    "",
    "Regras importantes:",
    "- NÃO use ferramentas, NÃO rode subagentes, NÃO rode evals, NÃO abra navegador, NÃO escreva arquivos. Apenas converse.",
    "- Faça UMA pergunta por vez, indo fundo o suficiente para escrever um bom prompt sem cansar o usuário.",
    "- Quando tiver informação suficiente (ou quando o usuário pedir para finalizar), gere o prompt final: " +
      "texto corrido em segunda pessoa (\"Você é...\"), sem frontmatter e sem título markdown, pronto para " +
      "ser usado como instrução base do agent.",
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
    "Para ENTREGAR o prompt pronto — NÃO use json. Escreva a linha `AGENT_PROMPT_COMPLETE`,",
    "depois uma linha com o marcador `<<<AGENT_PROMPT>>>`, depois o conteúdo COMPLETO do prompt em texto",
    "corrido, e por fim uma linha com o marcador `<<<END_AGENT_PROMPT>>>`. Exemplo:",
    "AGENT_PROMPT_COMPLETE",
    "<<<AGENT_PROMPT>>>",
    "Você é um revisor de PRs focado em segurança. Ao rodar sobre um card, ...",
    "<<<END_AGENT_PROMPT>>>",
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

// Extrai o prompt gerado entre os marcadores sentinela. Usa marcadores em vez de
// fence porque o próprio prompt pode conter blocos ``` internos.
function extractAgentPrompt(text) {
  const m = (text ?? "").match(/<<<AGENT_PROMPT>>>\r?\n([\s\S]*?)\r?\n<<<END_AGENT_PROMPT>>>/);
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

// Normaliza a resposta do Claude no protocolo { type: "question" | "complete" }.
// Se nada casar, degrada para uma pergunta com o texto inteiro (mantém o fluxo vivo).
export function parseCreatorResponse(finalText) {
  const content = extractAgentPrompt(finalText);
  if (content && content.trim()) {
    return { type: "complete", content: content.replace(/\s+$/, "") };
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

// Roda um turno da conversa de criação do prompt do agent. Primeiro turno usa
// runClaude (com -n <sessionId>); os seguintes usam resumeClaude (--resume <sessionId>).
export async function runCreatorTurn({ sessionId, prompt, started, model, effort }) {
  const first = !started;
  const fullPrompt = first
    ? buildPreamble() + "\n\nPedido inicial do usuário:\n" + prompt.trim()
    : "Resposta/instrução do usuário:\n" + prompt.trim() + "\n\n" + TURN_REMINDER;

  const opts = { model: model || "sonnet", effort: effort || "medium" };
  const result = first
    ? await runClaude(fullPrompt, process.cwd(), NOOP_LOG, null, null, { ...opts, sessionId })
    : await resumeClaude(fullPrompt, process.cwd(), NOOP_LOG, sessionId, null, opts);

  if (result.code !== 0) {
    throw new Error(`Claude falhou: ${failureDetail(result, null)}`);
  }
  return parseCreatorResponse(extractFinalText(result.output));
}
