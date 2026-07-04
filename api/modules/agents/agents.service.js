import { randomUUID } from "crypto";
import path from "path";
import { getConfig, setConfig } from "../config/config.service.js";
import { getActiveSkillNames, getSkillsContent } from "../skills/skills.service.js";
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

// Remove o bloco de frontmatter (--- ... ---) da SKILL.md: os metadados (name,
// description, disable-model-invocation etc.) são para o harness, não para o
// prompt — flags como disable-model-invocation confundiriam o agent.
function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

// Monta o prompt final do agent:
//   1. prompt do agent
//   2. conteúdo das skills a usar (ativas globais + linkadas ao agent), injetado
//      direto no prompt. Injetar o conteúdo (em vez de só citar o nome) garante
//      que o agent siga a skill mesmo sem ela estar instalada na máquina/worktree
//      e mesmo quando a skill não é invocável pelo modelo (disable-model-invocation).
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
  // getSkillsContent ignora nomes desconhecidos e preserva a ordem.
  for (const skill of getSkillsContent(names)) {
    const dir = path.dirname(skill.path);
    sections.push(
      `# Skill: ${skill.name}\n\n` +
        `Siga as instruções desta skill como parte do seu papel. Arquivos auxiliares que ela referencie por caminho relativo (ex.: references/) estão em \`${dir}\`.\n\n` +
        stripFrontmatter(skill.content).trim(),
    );
  }
  return sections.join("\n\n");
}
