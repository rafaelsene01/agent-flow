import { spawnSync } from "child_process";
import { graphQL } from "./github.client.js";
import { getConfig } from "../config/config.service.js";

function ghEnv() {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  delete env.GITHUB_KEY;
  delete env.GITHUB_AUTH_TOKEN;
  return env;
}

const QUERY = `{
  viewer {
    projectsV2(first: 50) {
      nodes {
        id title number url
        repositories(first: 20) {
          nodes { name nameWithOwner url }
        }
      }
    }
    organizations(first: 30) {
      nodes {
        login
        projectsV2(first: 50) {
          nodes {
            id title number url
            repositories(first: 20) {
              nodes { name nameWithOwner url }
            }
          }
        }
      }
    }
  }
}`;

function normalizeNodes(nodes, org = null) {
  return (nodes ?? []).map((n) => ({
    id:     n.id,
    title:  n.title,
    number: n.number,
    url:    n.url,
    org,
    repos:  (n.repositories?.nodes ?? []).map((r) => ({
      name:     r.name,
      fullName: r.nameWithOwner,
      cloneUrl: r.url,
    })),
  }));
}

function parseResponse(raw) {
  const viewer = raw.data?.viewer;
  if (!viewer) throw new Error(JSON.stringify(raw.errors ?? raw));

  const personal  = normalizeNodes(viewer.projectsV2?.nodes);
  const orgBoards = (viewer.organizations?.nodes ?? []).flatMap((org) =>
    normalizeNodes(org.projectsV2?.nodes, org.login)
  );

  return [...personal, ...orgBoards];
}

function viaGhCli() {
  const result = spawnSync("gh", ["api", "graphql", "--input", "-"], {
    input:    JSON.stringify({ query: QUERY }),
    encoding: "utf-8",
    timeout:  20000,
    shell:    true,
    env:      ghEnv(),
  });

  if (result.error) throw new Error(`gh CLI indisponível: ${result.error.message}`);

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    if (stderr.includes("required scopes") || stderr.includes("read:project")) {
      throw new Error("MISSING_SCOPE:read:project");
    }
    throw new Error(`gh CLI: ${stderr}`);
  }

  return parseResponse(JSON.parse(result.stdout));
}

export async function listBoards() {
  const { githubMethod } = getConfig();

  if (githubMethod === "env") {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;
    return parseResponse(await graphQL(QUERY, token));
  }

  if (githubMethod === "gh-cli") {
    return viaGhCli();
  }

  // método ainda não detectado (status ainda não foi chamado)
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;
  if (token) return parseResponse(await graphQL(QUERY, token));

  return viaGhCli();
}
