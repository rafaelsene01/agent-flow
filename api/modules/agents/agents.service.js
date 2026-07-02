import { randomUUID } from "crypto";
import { getConfig, setConfig } from "../config/config.service.js";
import { getActiveSkills, getSkillsContent } from "../skills/skills.service.js";

// Agents persistem em ~/.agent-flow/config.json → agents (default []). Mesmo
// padrão de read-modify-write usado por activeSkills nas skills.

export function listAgents() {
  return getConfig().agents ?? [];
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
  const linked = Array.isArray(skills) ? skills.filter((s) => typeof s === "string") : [];

  const agent = {
    id: randomUUID(),
    name: trimmedName,
    prompt: trimmedPrompt,
    skills: [...new Set(linked)],
    model: typeof model === "string" && model.trim() ? model.trim() : "sonnet",
    effort: typeof effort === "string" && effort.trim() ? effort.trim() : "medium",
    createdAt: new Date().toISOString(),
  };
  const current = getConfig().agents ?? [];
  await setConfig({ agents: [...current, agent] });
  return agent;
}

// Edita um agent existente (mesmas regras/validação do createAgent). Preserva id
// e createdAt; regrava name, prompt, skills e model/effort. Agent inexistente → erro.
export async function updateAgent(id, { name, prompt, skills, model, effort }) {
  const current = getConfig().agents ?? [];
  const existing = current.find((a) => a.id === id);
  if (!existing) throw new Error("Agent não encontrado");

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (!trimmedName) throw new Error("name obrigatório");
  if (!trimmedPrompt) throw new Error("prompt obrigatório");
  const linked = Array.isArray(skills) ? skills.filter((s) => typeof s === "string") : [];

  const updated = {
    ...existing,
    name: trimmedName,
    prompt: trimmedPrompt,
    skills: [...new Set(linked)],
    model: typeof model === "string" && model.trim() ? model.trim() : "sonnet",
    effort: typeof effort === "string" && effort.trim() ? effort.trim() : "medium",
    updatedAt: new Date().toISOString(),
  };
  await setConfig({ agents: current.map((a) => (a.id === id ? updated : a)) });
  return updated;
}

// Remove um agent pelo id. Agent inexistente → erro (mapeado para 404 na rota).
export async function deleteAgent(id) {
  const current = getConfig().agents ?? [];
  if (!current.some((a) => a.id === id)) throw new Error("Agent não encontrado");
  await setConfig({ agents: current.filter((a) => a.id !== id) });
}

function skillBlock(s) {
  return `## Skill: ${s.name}\n\n${s.content}`;
}

// Monta o prompt final do agent:
//   1. contexto de TODAS as skills ativas (global)
//   2. prompt do agent
//   3. contexto das skills linkadas ao agent que ainda NÃO estão ativas
// Skills que são ativas E linkadas aparecem só uma vez (no bloco 1), evitando
// duplicação no prompt final.
export function buildAgentPrompt(id) {
  const agent = getAgent(id);
  if (!agent) throw new Error("Agent não encontrado");

  const active = getActiveSkills();
  const activeNames = new Set(active.map((s) => s.name));
  const linkedOnly = getSkillsContent(agent.skills).filter(
    (s) => !activeNames.has(s.name),
  );

  const sections = [];
  if (active.length) {
    sections.push("# Skills Ativas");
    for (const s of active) sections.push(skillBlock(s));
  }
  sections.push(`# Agent: ${agent.name}\n\n${agent.prompt}`);
  if (linkedOnly.length) {
    sections.push("# Skills Linkadas");
    for (const s of linkedOnly) sections.push(skillBlock(s));
  }
  return sections.join("\n\n");
}
