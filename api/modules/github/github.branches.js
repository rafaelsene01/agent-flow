import { getToken } from "./github.client.js";

const BASE_URL = "https://api.github.com";

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

export async function listBranches(owner, repo) {
  const token = requireToken();
  const data  = await ghFetch(`/repos/${owner}/${repo}/branches?per_page=100`, token);
  return data.map((b) => ({ name: b.name, sha: b.commit.sha }));
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
