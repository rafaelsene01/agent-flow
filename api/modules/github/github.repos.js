import { execSync } from "child_process";
import { getRepositories } from "./github.client.js";

export async function listRepos() {
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;
  if (envToken) {
    try {
      const repos = await getRepositories(envToken);
      return repos.map((r) => ({
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        description: r.description ?? "",
        updatedAt: r.updated_at,
        sshUrl: r.ssh_url,
        cloneUrl: r.clone_url,
      }));
    } catch {}
  }

  try {
    const out = execSync(
      "gh repo list --json name,nameWithOwner,isPrivate,description,updatedAt,sshUrl,url --limit 100",
      { stdio: "pipe", encoding: "utf-8", timeout: 15000 }
    );
    return JSON.parse(out).map((r) => ({
      name: r.name,
      fullName: r.nameWithOwner,
      private: r.isPrivate,
      description: r.description ?? "",
      updatedAt: r.updatedAt,
      sshUrl: r.sshUrl,
      cloneUrl: r.url,
    }));
  } catch {}

  return [];
}
