import { getConfig } from "../config/config.service.js";

// Map<id, { child: ChildProcess, startedAt: Date }>
const registry = new Map();
let activeCount = 0;

export function acquireSlot() {
  const max = Math.max(1, getConfig().maxConcurrentRuns ?? 3);
  if (activeCount >= max) {
    const err = new Error(`Limite de runs simultâneos atingido (${activeCount}/${max}). Aguarde um run terminar.`);
    err.status = 429;
    throw err;
  }
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
  entry.child.kill("SIGTERM");
  return "ok";
}

export function getActiveCount() {
  return activeCount;
}
