import { execSync } from "child_process";

const BASE_URL = "https://api.github.com";

let _cachedToken = null;

export function getToken() {
  const env = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;
  if (env) return env;
  if (_cachedToken) return _cachedToken;
  try {
    _cachedToken = execSync("gh auth token", {
      encoding: "utf-8",
      timeout:  5000,
      shell:    true,
    }).trim();
    return _cachedToken;
  } catch {
    return null;
  }
}

export function clearTokenCache() {
  _cachedToken = null;
}

async function request(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

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
  const res = await fetch(`${BASE_URL}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GraphQL error ${res.status}: ${text}`);
  }
  return res.json();
}
