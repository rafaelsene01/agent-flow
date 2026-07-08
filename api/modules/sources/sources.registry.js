// Registry de SourceProviders (fonte de cards).
// Puro, sem dependências: apenas guarda e resolve providers registrados no bootstrap.
// Ver contrato em ./sources.contract.js e regras em docs/providers.md.

const providers = new Map();

/**
 * Registra um SourceProvider sob seu nome.
 * @param {string} name - identificador do source (ex.: "github-board")
 * @param {import("./sources.contract.js").SourceProvider} provider
 */
export function register(name, provider) {
  if (!name) throw new Error("register: nome do source é obrigatório");
  providers.set(name, provider);
}

/**
 * Resolve um SourceProvider pelo nome.
 * @param {string} name
 * @returns {import("./sources.contract.js").SourceProvider}
 * @throws se o source não estiver registrado
 */
export function get(name) {
  const provider = providers.get(name);
  if (!provider) throw new Error(`UNKNOWN_SOURCE:${name}`);
  return provider;
}

/** @returns {string[]} nomes dos sources registrados */
export function list() {
  return [...providers.keys()];
}
