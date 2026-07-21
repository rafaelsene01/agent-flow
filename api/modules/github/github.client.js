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

// GitHub 5xx = indisponibilidade do lado deles (a página "Unicorn" vem como HTML
// gigante): mensagem amigável em vez de despejar o body na UI. Nos demais status
// mantém o texto do body. `err.status` fica no erro para rotas que repassam
// (`err.status ?? 500`).
export function githubApiError(prefix, status, text) {
  const err =
    status >= 500
      ? new Error(
          `GitHub está fora do ar no momento (HTTP ${status}) — não foi possível validar a operação. Tente novamente em instantes.`,
        )
      : new Error(`${prefix} ${status}: ${text}`);
  err.status = status >= 500 ? 503 : status;
  return err;
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
      signal: AbortSignal.timeout(30_000),
    }),
  );

  checkRateLimit(res);

  if (!res.ok) {
    const text = await res.text();
    throw githubApiError("GitHub API error", res.status, text);
  }

  return res.json();
}

export async function validateToken(token) {
  return request("/user", token);
}

// Pagina um endpoint REST que devolve array (cap de segurança: 10 págs = 1000).
async function paginate(basePath, token) {
  const sep = basePath.includes("?") ? "&" : "?";
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await request(`${basePath}${sep}per_page=100&page=${page}`, token);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export async function getRepositories(token) {
  // affiliation explícito para incluir repos de organizações a que o usuário tem
  // acesso (não só os próprios).
  return paginate("/user/repos?sort=updated&affiliation=owner,collaborator,organization_member", token);
}

/** Organizações a que o usuário pertence. */
export async function getOrgs(token) {
  return paginate("/user/orgs", token);
}

/** Repos de uma organização (public + private acessíveis). Completa o /user/repos. */
export async function getOrgRepositories(org, token) {
  return paginate(`/orgs/${encodeURIComponent(org)}/repos?type=all`, token);
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
      signal: AbortSignal.timeout(30_000),
    }),
  );
  checkRateLimit(res);
  if (!res.ok) {
    const text = await res.text();
    throw githubApiError("GitHub GraphQL error", res.status, text);
  }
  return res.json();
}
