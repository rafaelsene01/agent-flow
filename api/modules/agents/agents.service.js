import { randomUUID } from "crypto";
import path from "path";
import { getConfig, setConfig } from "../config/config.service.js";
import { getActiveSkillNames, listSkills } from "../skills/skills.service.js";
import { DEFAULT_AGENTS, isDefaultAgentId } from "./defaults/index.js";

// Agents persistem em ~/.agent-flow/config.json → agents (default []). Mesmo
// padrão de read-modify-write usado por activeSkills nas skills.
//
// Além dos criados pelo usuário, sempre expomos os agentes default que
// acompanham o app (api/modules/agents/defaults/). Eles vêm primeiro na lista,
// são marcados com isDefault e não podem ser editados nem excluídos.

export function listAgents() {
  return [...DEFAULT_AGENTS, ...(getConfig().agents ?? [])];
}

export function getAgent(id) {
  return listAgents().find((a) => a.id === id) ?? null;
}

// Cria um agent com nome, prompt, skills linkadas (por nome) e o par model/effort
// que o runner usa ao executar. Valida os campos obrigatórios; skills desconhecidas
// são toleradas (ignoradas na montagem do prompt). model/effort seguem os defaults
// do runner (sonnet/medium) quando não informados.
export async function createAgent({ name, prompt, skills, model, effort }) {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (!trimmedName) throw new Error("name obrigatório");
  if (!trimmedPrompt) throw new Error("prompt obrigatório");
  const linked = Array.isArray(skills)
    ? skills.filter((s) => typeof s === "string")
    : [];

  const agent = {
    id: randomUUID(),
    name: trimmedName,
    prompt: trimmedPrompt,
    skills: [...new Set(linked)],
    model: typeof model === "string" && model.trim() ? model.trim() : "sonnet",
    effort:
      typeof effort === "string" && effort.trim() ? effort.trim() : "medium",
    createdAt: new Date().toISOString(),
  };
  const current = getConfig().agents ?? [];
  await setConfig({ agents: [...current, agent] });
  return agent;
}

// Edita um agent existente (mesmas regras/validação do createAgent). Preserva id
// e createdAt; regrava name, prompt, skills e model/effort. Agent inexistente → erro.
export async function updateAgent(id, { name, prompt, skills, model, effort }) {
  if (isDefaultAgentId(id))
    throw new Error("Agent default não pode ser editado");
  const current = getConfig().agents ?? [];
  const existing = current.find((a) => a.id === id);
  if (!existing) throw new Error("Agent não encontrado");

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (!trimmedName) throw new Error("name obrigatório");
  if (!trimmedPrompt) throw new Error("prompt obrigatório");
  const linked = Array.isArray(skills)
    ? skills.filter((s) => typeof s === "string")
    : [];

  const updated = {
    ...existing,
    name: trimmedName,
    prompt: trimmedPrompt,
    skills: [...new Set(linked)],
    model: typeof model === "string" && model.trim() ? model.trim() : "sonnet",
    effort:
      typeof effort === "string" && effort.trim() ? effort.trim() : "medium",
    updatedAt: new Date().toISOString(),
  };
  await setConfig({ agents: current.map((a) => (a.id === id ? updated : a)) });
  return updated;
}

// Remove um agent pelo id. Agent inexistente → erro (mapeado para 404 na rota).
export async function deleteAgent(id) {
  if (isDefaultAgentId(id))
    throw new Error("Agent default não pode ser excluído");
  const current = getConfig().agents ?? [];
  if (!current.some((a) => a.id === id))
    throw new Error("Agent não encontrado");
  await setConfig({ agents: current.filter((a) => a.id !== id) });
}

// Monta o prompt final do agent:
//   1. prompt do agent
//   2. referência às skills a usar (ativas globais + linkadas ao agent): o prompt
//      aponta o caminho absoluto da SKILL.md em <agent-flow>/.claude/skills e
//      instrui o agente a lê-la (junto com references/, se existir) antes de
//      executar. Referenciar o caminho — em vez de injetar o conteúdo inline —
//      dá ao agente o contexto completo da skill, incluindo os arquivos
//      auxiliares. Os caminhos são do projeto agent-flow (cwd do servidor), não
//      das skills globais em ~/.claude, que o usuário pode não ter instalado.
export function buildAgentPrompt(id) {
  const agent = getAgent(id);
  if (!agent) throw new Error("Agent não encontrado");

  const names = [];
  const seen = new Set();
  for (const name of [...getActiveSkillNames(), ...(agent.skills ?? [])]) {
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  const sections = [`# Agent: ${agent.name}\n\n${agent.prompt}`];
  const byName = new Map(listSkills().map((s) => [s.name, s]));
  for (const name of names) {
    // Nomes desconhecidos são ignorados; a ordem dos nomes é preservada.
    const skill = byName.get(name);
    if (!skill) continue;
    const dir = path.dirname(skill.path);
    sections.push(
      `# Skill: ${skill.name}\n\n` +
        (skill.description ? `${skill.description}\n\n` : "") +
        "Esta skill faz parte do seu papel. ANTES de começar a tarefa, leia o " +
        `arquivo \`${skill.path}\` e siga as instruções dele. Se existir a pasta ` +
        `\`${path.join(dir, "references")}\` ou outros arquivos que a skill ` +
        `referencie por caminho relativo, leia-os também — eles estão em \`${dir}\`.`,
    );
  }
  return sections.join("\n\n");
}
