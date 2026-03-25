const BASE_URL = "https://api.github.com";

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

/**
 * Validates the token and returns the authenticated user info.
 * @param {string} token
 * @returns {{ login: string, name: string, avatar_url: string }}
 */
export async function validateToken(token) {
  return request("/user", token);
}

/**
 * Returns the list of repositories the authenticated user has access to.
 * @param {string} token
 * @returns {Array<{ id: number, full_name: string, private: boolean }>}
 */
export async function getRepositories(token) {
  return request("/user/repos?per_page=100&sort=updated", token);
}
