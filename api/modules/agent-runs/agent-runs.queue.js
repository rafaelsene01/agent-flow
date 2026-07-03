import { randomUUID } from "crypto";
import { getConfig } from "../config/config.service.js";
import { createRun, getRun, patchRun, runsProcessingByAgent, nextQueuedForFreeAgents, failDependents, resetProcessingToQueued } from "./agent-runs.store.js";
import { startRun } from "./agent-runs.runner.js";

// Lock em memória por agent_id, além do estado no DB — evita corrida entre
// ticks concorrentes disparados por enqueue/onRunSettled na mesma janela de I/O.
const active = new Set();

export function tick() {
  const cap = getConfig().maxConcurrentRuns ?? 3;
  if (active.size >= cap) return;

  const busyAgentIds = new Set([...active, ...runsProcessingByAgent().keys()]);
  const candidates = nextQueuedForFreeAgents(busyAgentIds).slice(0, cap - active.size);

  for (const run of candidates) {
    active.add(run.agent_id);
    const started = patchRun(run.id, { status: "processing", started_at: new Date().toISOString() });
    startRun(started, { onSettled: () => onRunSettled(run.agent_id, run.id) }).catch((err) => {
      patchRun(run.id, { status: "error", last_error: err.message });
      onRunSettled(run.agent_id, run.id);
    });
  }
}

export function onRunSettled(agentId, runId) {
  active.delete(agentId);
  // Se o run terminou em erro, os passos seguintes da pipeline não podem rodar
  // (dependem deste `done`) — falha-os em cascata para não ficarem presos na fila.
  if (runId) {
    const r = getRun(runId);
    if (r && r.status === "error") {
      failDependents(runId, `Passo anterior falhou: ${r.agent_name}`);
    }
  }
  tick();
}

export function enqueue(fields) {
  const run = createRun({ chainId: randomUUID(), ...fields });
  tick();
  return run;
}

// Enfileira uma pipeline ordenada de agentes na MESMA worktree: cada passo só roda
// quando o anterior terminou `done` (depends_on), mesmo entre agentes diferentes.
// `steps` = [{ id?, agentId, agentName, model, effort }] na ordem de execução.
export function enqueueChain({ steps, ...common }) {
  const chainId = randomUUID();
  const runs = [];
  let prevId = null;
  for (const step of steps) {
    const run = createRun({
      ...common,
      chainId,
      id: step.id,
      agentId: step.agentId,
      agentName: step.agentName,
      model: step.model,
      effort: step.effort,
      dependsOn: prevId,
    });
    runs.push(run);
    prevId = run.id;
  }
  tick();
  return runs;
}

export function recoverAndDispatch() {
  resetProcessingToQueued();
  tick();
}
