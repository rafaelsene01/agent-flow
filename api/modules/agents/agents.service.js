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

// Cria um agent com nome, prompt e skills linkadas (por nome). Valida os campos
// obrigatórios; skills desconhecidas são toleradas (ignoradas na montagem do prompt).
export async function createAgent({ name, prompt, skills }) {
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
    createdAt: new Date().toISOString(),
  };
  const current = getConfig().agents ?? [];
  await setConfig({ agents: [...current, agent] });
  return agent;
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
