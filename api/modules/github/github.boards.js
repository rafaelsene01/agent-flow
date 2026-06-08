import { graphQL, getToken } from "./github.client.js";

function requireToken() {
  const token = getToken();
  if (!token) throw new Error("GitHub não autenticado. Configure GH_TOKEN ou execute 'gh auth login'.");
  return token;
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
            options { id name color }
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

function parseColumns(raw) {
  const fields = raw.data?.node?.fields?.nodes ?? [];
  const statusField =
    fields.find((f) => f?.name?.toLowerCase() === "status") ??
    fields.find((f) => f?.options);
  return (statusField?.options ?? []).map((o) => ({ id: o.id, name: o.name, color: o.color ?? null }));
}

export async function listBoards() {
  return parseResponse(await graphQL(QUERY, requireToken()));
}

export async function listViews(projectId) {
  return parseViews(await graphQL(VIEWS_QUERY, requireToken(), { id: projectId }));
}

export async function listColumns(projectId) {
  return parseColumns(await graphQL(COLUMNS_QUERY, requireToken(), { id: projectId }));
}
