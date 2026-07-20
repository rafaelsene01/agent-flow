// Client neutro de Repo (host de código). Único ponto do frontend que conhece os
// endpoints de repos. Nenhum componente referencia o namespace github antigo nem
// o host como discriminador. Ver docs/providers.md.

// Host default enquanto só existe o RepoProvider github.
export const DEFAULT_HOST = "github";

const json = (r) => r.json();

// Hosts de código registrados + status de cada um (tela de Conexões).
// [{ host, status: { connected, method, user, name, error?, commands? } }]
// Servido do cache SWR do backend; `refresh:true` (=> ?refresh=1) revalida.
export function hosts({ refresh = false } = {}) {
  return fetch(`/api/repos/hosts${refresh ? "?refresh=1" : ""}`).then(json);
}

export function listBranches(owner, repo, query = "", host = DEFAULT_HOST) {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  return fetch(`/api/repos/${host}/${owner}/${repo}/branches${qs}`).then(json);
}

// Cria branch + (se cardNumber) worktree. Espelha a resposta da rota antiga.
export function createBranch(owner, repo, { newBranch, originBranch, cardNumber }, host = DEFAULT_HOST) {
  return fetch(`/api/repos/${host}/${owner}/${repo}/branches`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ newBranch, originBranch, cardNumber }),
  }).then(json);
}

export function listRepos(host = DEFAULT_HOST) {
  return fetch(`/api/repos/${host}`).then(json);
}
