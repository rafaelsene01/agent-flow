import { execSync } from "child_process";
import { getRepositories, getOrgs, getOrgRepositories } from "./github.client.js";

// Normaliza o objeto REST do GitHub (mesmo shape via token de env ou `gh api`).
function normalize(r) {
  return {
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    description: r.description ?? "",
    updatedAt: r.updated_at,
    sshUrl: r.ssh_url,
    cloneUrl: r.clone_url,
  };
}

// Junta repos do usuário (owner/collaborator/org-member) com os repos de CADA
// organização a que ele pertence — /user/repos sozinho não devolve a org inteira.
// Dedup por full_name.
async function gatherViaToken(token) {
  const byName = new Map();
  for (const r of await getRepositories(token)) byName.set(r.full_name, r);
  const orgs = await getOrgs(token).catch(() => []);
  for (const org of orgs) {
    try {
      for (const r of await getOrgRepositories(org.login, token)) byName.set(r.full_name, r);
    } catch { /* org sem acesso de listagem — ignora */ }
  }
  return [...byName.values()].map(normalize);
}

// Mesmo objetivo via CLI `gh api --paginate` (usa a auth real do gh; inclui orgs).
function ghApiArray(path) {
  const out = execSync(`gh api "${path}" --paginate`, {
    stdio: "pipe", encoding: "utf-8", timeout: 30000, maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function gatherViaGh() {
  const byName = new Map();
  for (const r of ghApiArray("user/repos?sort=updated&affiliation=owner,collaborator,organization_member&per_page=100")) {
    byName.set(r.full_name, r);
  }
  let orgs = [];
  try { orgs = ghApiArray("user/orgs?per_page=100"); } catch { /* ignora */ }
  for (const org of orgs) {
    try {
      for (const r of ghApiArray(`orgs/${org.login}/repos?type=all&per_page=100`)) byName.set(r.full_name, r);
    } catch { /* ignora */ }
  }
  return [...byName.values()].map(normalize);
}

export async function listRepos() {
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;
  if (envToken) {
    try {
      const repos = await gatherViaToken(envToken);
      if (repos.length) return repos;
    } catch { /* token de env inválido — cai no gh */ }
  }

  try {
    return gatherViaGh();
  } catch { /* gh indisponível */ }

  return [];
}
