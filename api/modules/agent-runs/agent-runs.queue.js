import { randomUUID } from "crypto";
import { getMaxConcurrent, getActiveCount, reserveSlot, releaseSlot } from "../claude/claude.concurrency.js";
import { createRun, getRun, patchRun, runsProcessingByAgent, worktreeKey, worktreesOccupied, nextQueuedForFreeAgents, failDependents, resetProcessingToQueued, healOrphanDependencies, promoteReadyBreakpoints, approveBreakpoint as approveBreakpointStore } from "./agent-runs.store.js";
import { startRun } from "./agent-runs.runner.js";

// Lock em memória por agent_id, além do estado no DB — evita corrida entre
// ticks concorrentes disparados por enqueue/onRunSettled na mesma janela de I/O.
const active = new Set();
// Lock em memória por worktree (chave repo+branch): garante que dois agentes nunca
// rodem na mesma árvore de trabalho ao mesmo tempo. Cobre a janela entre despachar e
// o DB refletir `processing`, complementando worktreesOccupied().
const activeWorktrees = new Set();

const wtKey = (run) => worktreeKey(run.repo, run.target_branch);

export function tick() {
  // Pontos de parada prontos (passo anterior `done`) passam a aguardar aprovação
  // do usuário — não consomem slot de concorrência nem rodam no Claude.
  promoteReadyBreakpoints();

  // Teto GLOBAL de processos `claude`: getActiveCount() soma runs da fila + chats
  // de worktree (contador único em claude.concurrency). Assim a fila recua quando
  // o chat está ocupando slots, e vice-versa — nunca se estoura o limite.
  const cap = getMaxConcurrent();
  const free = cap - getActiveCount();
  if (free <= 0) return;

  const busyAgentIds = new Set([...active, ...runsProcessingByAgent().keys()]);
  const busyWorktrees = new Set([...activeWorktrees, ...worktreesOccupied()]);
  const candidates = nextQueuedForFreeAgents(busyAgentIds, busyWorktrees).slice(0, free);

  for (const run of candidates) {
    reserveSlot();
    active.add(run.agent_id);
    activeWorktrees.add(wtKey(run));
    const started = patchRun(run.id, { status: "processing", started_at: new Date().toISOString() });
    startRun(started, { onSettled: () => onRunSettled(run.agent_id, run.id, wtKey(run)) }).catch((err) => {
      patchRun(run.id, { status: "error", last_error: err.message });
      onRunSettled(run.agent_id, run.id, wtKey(run));
    });
  }
}

export function onRunSettled(agentId, runId, worktreeKey) {
  // Set.delete devolve true só se o agentId estava presente: libera o slot global
  // exatamente uma vez por run, mesmo que onRunSettled seja chamado em duplicidade
  // (caminho de erro do startRun + .catch do dispatcher).
  if (active.delete(agentId)) releaseSlot();
  if (worktreeKey) activeWorktrees.delete(worktreeKey);
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
// `steps` = [{ id?, agentId, agentName, model, effort, sessionId?, sessionIndex? }]
// na ordem de execução — sessionId/sessionIndex compartilham sessão entre passos.
export function enqueueChain({ steps, ...common }) {
  const chainId = randomUUID();
  const runs = [];
  let prevId = null;
  for (const step of steps) {
    const run = createRun({
      ...common,
      chainId,
      id: step.id,
      kind: step.kind,
      agentId: step.agentId,
      agentName: step.agentName,
      model: step.model,
      effort: step.effort,
      sessionId: step.sessionId,
      sessionIndex: step.sessionIndex,
      dependsOn: prevId,
    });
    runs.push(run);
    prevId = run.id;
  }
  tick();
  return runs;
}

// Aprova um ponto de parada aguardando: marca `done` e destrava o próximo passo.
export function approveBreakpoint(id) {
  const ok = approveBreakpointStore(id);
  if (ok) tick();
  return ok;
}

export function recoverAndDispatch() {
  // Conserta chains que ficaram com dependência órfã (passo intermediário removido
  // sem re-vínculo) antes de re-despachar — senão os passos seguintes ficam presos.
  healOrphanDependencies();
  resetProcessingToQueued();
  tick();
}
