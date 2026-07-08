// Registry de RepoProviders (host de código).
// Puro, sem dependências: apenas guarda e resolve providers registrados no bootstrap.
// Ver contrato em ./repos.contract.js e regras em docs/providers.md.

const providers = new Map();

/**
 * Registra um RepoProvider sob seu host.
 * @param {string} name - identificador do host (ex.: "github")
 * @param {import("./repos.contract.js").RepoProvider} provider
 */
export function register(name, provider) {
  if (!name) throw new Error("register: host do repo é obrigatório");
  providers.set(name, provider);
}

/**
 * Resolve um RepoProvider pelo host.
 * @param {string} name
 * @returns {import("./repos.contract.js").RepoProvider}
 * @throws se o host não estiver registrado
 */
export function get(name) {
  const provider = providers.get(name);
  if (!provider) throw new Error(`UNKNOWN_REPO_HOST:${name}`);
  return provider;
}

/** @returns {string[]} hosts registrados */
export function list() {
  return [...providers.keys()];
}
