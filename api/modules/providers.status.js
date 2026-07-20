// Cache SWR do status dos providers (Source de cards + Repo host).
// Motivo: /api/sources e /api/repos/hosts chamam o getStatus de cada provider
// (rede: token GitHub, health-check do custom-kanban). Sem cache, toda abertura
// do criar-board / tela de Conexões paga essa latência. Aqui:
//   - o boot aquece os dois caches (warmProviderStatus, fire-and-forget);
//   - leituras sem `refresh` devolvem o snapshot em memória na hora;
//   - `refresh:true` recomputa (revalidação disparada ao abrir as telas).
// Os getStatus rodam em paralelo (Promise.all) para a revalidação ser rápida.
// Ver docs/providers.md.

import { get as getSource, list as listSources } from "./sources/sources.registry.js";
import { get as getRepo, list as listRepoHosts } from "./repos/repos.registry.js";

let sourcesCache = null; // Array<{source,status}> | null
let hostsCache   = null; // Array<{host,status}>   | null

async function statusOf(getStatus) {
  try { return await getStatus(); }
  catch (err) { return { connected: false, error: err.message }; }
}

async function computeSources() {
  sourcesCache = await Promise.all(
    listSources().map(async (source) => ({ source, status: await statusOf(getSource(source).getStatus) }))
  );
  return sourcesCache;
}

async function computeHosts() {
  hostsCache = await Promise.all(
    listRepoHosts().map(async (host) => ({ host, status: await statusOf(getRepo(host).getStatus) }))
  );
  return hostsCache;
}

/** Status dos Sources. `refresh` recomputa; senão devolve o cache (computa se vazio). */
export function getSourcesStatus({ refresh = false } = {}) {
  if (!refresh && sourcesCache) return Promise.resolve(sourcesCache);
  return computeSources();
}

/** Status dos Repo hosts. Mesma semântica de getSourcesStatus. */
export function getHostsStatus({ refresh = false } = {}) {
  if (!refresh && hostsCache) return Promise.resolve(hostsCache);
  return computeHosts();
}

/** Aquece os dois caches no boot, sem bloquear o start do servidor. */
export function warmProviderStatus() {
  computeSources().catch(() => {});
  computeHosts().catch(() => {});
}
