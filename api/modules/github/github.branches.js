import { getToken, graphQL } from "./github.client.js";

const BASE_URL = "https://api.github.com";

// Teto de branches retornadas numa única busca. Quando o repo tem mais que isso,
// o frontend passa a usar o filtro como busca server-side (GraphQL `refs(query:)`).
const BRANCH_PAGE_SIZE = 100;

const BRANCHES_QUERY = `
  query($owner: String!, $repo: String!, $query: String, $first: Int!) {
    repository(owner: $owner, name: $repo) {
      refs(
        refPrefix: "refs/heads/"
        query: $query
        first: $first
        orderBy: { field: ALPHABETICAL, direction: ASC }
      ) {
        pageInfo { hasNextPage }
        nodes {
          name
          target { oid }
        }
      }
    }
  }
`;

function requireToken() {
  const token = getToken();
  if (!token) throw new Error("GitHub não autenticado. Configure GH_TOKEN ou execute 'gh auth login'.");
  return token;
}

async function ghFetch(path, token, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `GitHub API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Lista branches do repo. Sem `query`, traz as primeiras `BRANCH_PAGE_SIZE` em
// ordem alfabética; com `query`, deixa o GitHub filtrar por nome no servidor —
// essencial para repos com mais branches do que o limite cabe numa página.
// Retorna { branches, hasMore }: `hasMore` sinaliza ao cliente que deve buscar
// no servidor (via filtro) em vez de filtrar só a fatia já carregada.
export async function listBranches(owner, repo, query = "") {
  const token = requireToken();
  const q     = (query ?? "").trim();
  const res   = await graphQL(BRANCHES_QUERY, token, {
    owner,
    repo,
    query: q || null,
    first: BRANCH_PAGE_SIZE,
  });
  if (res.errors?.length) throw new Error(res.errors[0].message);

  const refs     = res.data?.repository?.refs;
  const branches = (refs?.nodes ?? []).map((n) => ({ name: n.name, sha: n.target?.oid ?? null }));
  return { branches, hasMore: Boolean(refs?.pageInfo?.hasNextPage) };
}

export async function createBranch(owner, repo, newBranch, originBranch) {
  const token = requireToken();
  const origin = await ghFetch(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(originBranch)}`,
    token,
  );
  const sha = origin.commit.sha;
  await ghFetch(`/repos/${owner}/${repo}/git/refs`, token, {
    method: "POST",
    body:   JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
  });
}
