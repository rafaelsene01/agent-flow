import { execSync } from "child_process";

const BASE_URL = "https://api.github.com";

let _cachedToken = null;
let _badEnvToken = null; // token de env que já retornou 401 — ignorado a partir daí

function envToken() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY || null;
}

function readGhToken() {
  // O `gh auth token` ecoa de volta GH_TOKEN/GITHUB_TOKEN do ambiente se estiverem
  // setados, em vez da credencial armazenada pelo `gh auth login`. Removemos essas
  // vars para obter sempre o token real do login — essencial para o fallback de 401
  // funcionar quando o problema é justamente uma env var com token velho.
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  delete env.GH_ENTERPRISE_TOKEN;
  delete env.GITHUB_ENTERPRISE_TOKEN;
  try {
    return execSync("gh auth token", { encoding: "utf-8", timeout: 5000, shell: true, env }).trim() || null;
  } catch {
    return null;
  }
}

export function getToken() {
  const env = envToken();
  if (env && env !== _badEnvToken) return env;
  if (_cachedToken) return _cachedToken;
  _cachedToken = readGhToken();
  return _cachedToken;
}

export function clearTokenCache() {
  _cachedToken = null;
}

// Executa um fetch e, em caso de 401, trata o token atual como inválido e tenta
// de novo com um token fresco do `gh` CLI. Cobre dois cenários: o token OAuth do
// `gh` rotacionou, ou há uma env var (GH_TOKEN/GITHUB_TOKEN/GITHUB_KEY) com um
// token velho — nesse caso a env var é marcada como ruim para não ser reusada.
async function fetchWithTokenRefresh(token, doFetch) {
  let res = await doFetch(token);
  if (res.status === 401) {
    if (envToken() && envToken() === token) _badEnvToken = token;
    clearTokenCache();
    const fresh = readGhToken();
    if (fresh && fresh !== token) {
      _cachedToken = fresh;
      res = await doFetch(fresh);
    }
  }
  return res;
}

function checkRateLimit(res) {
  const remaining = parseInt(res.headers.get("x-ratelimit-remaining") ?? "999", 10);
  const resetAt   = parseInt(res.headers.get("x-ratelimit-reset")     ?? "0",   10);
  if (remaining < 10) {
    console.warn(`[github] rate limit baixo: ${remaining} req restantes`);
  }
  if (res.status === 403 && remaining === 0) {
    const waitMin = Math.ceil((resetAt - Date.now() / 1000) / 60);
    const err = new Error(`GitHub rate limit atingido. Aguarde ${waitMin} minuto(s).`);
    err.status = 429;
    throw err;
  }
}

async function request(path, token) {
  const res = await fetchWithTokenRefresh(token, (t) =>
    fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }),
  );

  checkRateLimit(res);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function validateToken(token) {
  return request("/user", token);
}

export async function getRepositories(token) {
  return request("/user/repos?per_page=100&sort=updated", token);
}

export async function graphQL(query, token, variables = {}) {
  const res = await fetchWithTokenRefresh(token, (t) =>
    fetch(`${BASE_URL}/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    }),
  );
  checkRateLimit(res);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GraphQL error ${res.status}: ${text}`);
  }
  return res.json();
}
