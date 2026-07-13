import os from "os";
import { getConfig } from "../config/config.service.js";
import { killTree } from "./claude.kill.js";

// Map<id, { child: ChildProcess, startedAt: Date }>
const registry = new Map();
// Contador ÚNICO de processos `claude` simultâneos. Compartilhado entre a fila de
// runs (agent-runs.queue) e o chat de worktree (routes/config/runner) — os dois
// caminhos disputam o mesmo teto, então não é possível estourar o limite somando
// runs + chats como acontecia com os dois contadores separados de antes.
let activeCount = 0;

// Teto adaptativo ao host quando maxConcurrentRuns não está setado. Cada processo
// `claude` é uma subárvore (tools/bash/MCP servers) pesada em CPU e RAM, então
// limitamos por núcleos (~metade) e por memória (~4 GB por run) e usamos o menor
// dos dois, com mínimo de 1. Máquinas fortes seguem paralelizando; máquinas
// pequenas param em 1–2 sozinhas, sem oversubscrever.
function adaptiveDefault() {
  const cores  = os.cpus()?.length || 2;
  const byCpu  = Math.max(1, Math.floor(cores / 2));
  const totalGb = os.totalmem() / 1024 ** 3;
  const byMem  = Math.max(1, Math.floor(totalGb / 4));
  return Math.min(byCpu, byMem);
}

// Fonte única do teto de processos `claude` simultâneos. Um número explícito em
// config.json sobrepõe; qualquer valor nulo cai no cálculo adaptativo.
export function getMaxConcurrent() {
  const configured = getConfig().maxConcurrentRuns;
  return configured != null ? Math.max(1, configured) : adaptiveDefault();
}

// Admissão que LANÇA quando cheio (429) — para chamadas síncronas como o chat de
// worktree, que devem recusar em vez de enfileirar.
export function acquireSlot() {
  const max = getMaxConcurrent();
  if (activeCount >= max) {
    const err = new Error(`Limite de runs simultâneos atingido (${activeCount}/${max}). Aguarde um run terminar.`);
    err.status = 429;
    throw err;
  }
  activeCount++;
}

// Reserva sem lançar — para o dispatcher da fila, que já checou getActiveCount()
// contra getMaxConcurrent() antes de despachar e nunca deve estourar no loop.
export function reserveSlot() {
  activeCount++;
}

export function releaseSlot() {
  if (activeCount > 0) activeCount--;
}

export function registerProcess(id, child) {
  registry.set(id, { child, startedAt: new Date() });
}

export function unregisterProcess(id) {
  registry.delete(id);
}

/**
 * @returns {'ok' | 'not-found' | 'already-done'}
 */
export function cancelProcess(id) {
  const entry = registry.get(id);
  if (!entry) return "not-found";
  if (entry.child.exitCode !== null || entry.child.killed) return "already-done";
  killTree(entry.child);
  return "ok";
}

export function getActiveCount() {
  return activeCount;
}
