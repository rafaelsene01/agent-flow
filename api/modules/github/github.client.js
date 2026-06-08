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

export async function validateToken(token) {
  return request("/user", token);
}

export async function getRepositories(token) {
  return request("/user/repos?per_page=100&sort=updated", token);
}

export async function graphQL(query, token) {
  const res = await fetch(`${BASE_URL}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GraphQL error ${res.status}: ${text}`);
  }
  return res.json();
}
