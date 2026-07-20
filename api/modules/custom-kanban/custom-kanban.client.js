// Client HTTP isolado do Custom Kanban. Encapsula base URL + auth (token no
// header Authorization). Único ponto do módulo que fala com o serviço externo;
// as env (CUSTOM_KANBAN_URL / CUSTOM_KANBAN_TOKEN) não vazam para fora daqui.
// Ver contrato do source em ../sources/sources.contract.js e docs/providers.md.

/** @returns {string|null} token do Custom Kanban (env), ou null se ausente. */
export function getToken() {
  return process.env.CUSTOM_KANBAN_TOKEN || null;
}

/** @returns {string|null} base URL sem barra final, ou null se ausente. */
export function getBaseUrl() {
  const url = process.env.CUSTOM_KANBAN_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

/**
 * O source só é "disponível" quando há token na env (gate de registro no
 * bootstrap). A base URL é validada em getStatus para dar erro claro na UI.
 * @returns {boolean}
 */
export function isConfigured() {
  return !!getToken();
}

/**
 * Requisição autenticada contra o Custom Kanban. Injeta o token no Authorization
 * e resolve o path relativo contra a base URL da env.
 * @param {string} path  ex.: "/api/health"
 * @param {RequestInit} [opts]
 * @returns {Promise<Response>}
 */
export function request(path, opts = {}) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("CUSTOM_KANBAN_URL não configurada");
  const token = getToken();
  if (!token) throw new Error("CUSTOM_KANBAN_TOKEN não configurada");

  return fetch(`${baseUrl}${path}`, {
    ...opts,
    signal: opts.signal ?? AbortSignal.timeout(30_000),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
}
