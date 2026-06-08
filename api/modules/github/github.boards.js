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

const VIEWS_QUERY = `query($id: ID!) {
  node(id: $id) {
    ... on ProjectV2 {
      views(first: 30) {
        nodes {
          id name number filter
        }
      }
    }
  }
}`;

const COLUMNS_QUERY = `query($id: ID!) {
  node(id: $id) {
    ... on ProjectV2 {
      fields(first: 20) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id name
            options { id name }
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

function repoFromFilter(filter) {
  if (!filter) return null;
  const m = filter.match(/repo:([^\s]+)/i);
  return m ? m[1] : null;
}

function parseViews(raw) {
  const nodes = raw.data?.node?.views?.nodes ?? [];
  return nodes.map((v) => ({
    id:     v.id,
    name:   v.name,
    number: v.number,
    filter: v.filter ?? "",
    repo:   repoFromFilter(v.filter),
  }));
}

function viaGhCliViews(projectId) {
  const result = spawnSync("gh", ["api", "graphql", "--input", "-"], {
    input:    JSON.stringify({ query: VIEWS_QUERY, variables: { id: projectId } }),
    encoding: "utf-8",
    timeout:  20000,
    shell:    true,
    env:      ghEnv(),
  });
  if (result.error) throw new Error(`gh CLI indisponível: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gh CLI: ${(result.stderr || "").trim()}`);
  return parseViews(JSON.parse(result.stdout));
}

export async function listViews(projectId) {
  const { githubMethod } = getConfig();
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;

  if (githubMethod === "env" || (!githubMethod && token)) {
    return parseViews(await graphQL(VIEWS_QUERY, token, { id: projectId }));
  }

  return viaGhCliViews(projectId);
}

function parseColumns(raw) {
  const fields = raw.data?.node?.fields?.nodes ?? [];
  const statusField =
    fields.find((f) => f?.name?.toLowerCase() === "status") ??
    fields.find((f) => f?.options);
  return (statusField?.options ?? []).map((o) => ({ id: o.id, name: o.name }));
}

function viaGhCliColumns(projectId) {
  const result = spawnSync("gh", ["api", "graphql", "--input", "-"], {
    input:    JSON.stringify({ query: COLUMNS_QUERY, variables: { id: projectId } }),
    encoding: "utf-8",
    timeout:  20000,
    shell:    true,
    env:      ghEnv(),
  });

  if (result.error) throw new Error(`gh CLI indisponível: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gh CLI: ${(result.stderr || "").trim()}`);

  return parseColumns(JSON.parse(result.stdout));
}

export async function listColumns(projectId) {
  const { githubMethod } = getConfig();
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;

  if (githubMethod === "env" || (!githubMethod && token)) {
    return parseColumns(await graphQL(COLUMNS_QUERY, token, { id: projectId }));
  }

  return viaGhCliColumns(projectId);
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
