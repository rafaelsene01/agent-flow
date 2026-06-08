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

const ITEMS_QUERY = `query($id: ID!, $first: Int!, $after: String) {
  node(id: $id) {
    ... on ProjectV2 {
      items(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content {
            __typename
            ... on Issue {
              title number url state
              assignees(first: 3) { nodes { login } }
              labels(first: 5) { nodes { name color } }
            }
            ... on PullRequest {
              title number url state
              assignees(first: 3) { nodes { login } }
              labels(first: 5) { nodes { name color } }
            }
            ... on DraftIssue { title }
          }
          fieldValues(first: 15) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2SingleSelectField { name } }
              }
            }
          }
        }
      }
    }
  }
}`;

function parseItems(raw) {
  const data = raw.data?.node?.items;
  if (!data) throw new Error(JSON.stringify(raw.errors ?? raw));

  const items = (data.nodes ?? []).map((node) => {
    const content = node.content ?? {};
    const statusFV = (node.fieldValues?.nodes ?? []).find(
      (fv) => fv?.field?.name?.toLowerCase() === "status"
    );
    return {
      id:        node.id,
      type:      content.__typename ?? "Unknown",
      title:     content.title ?? "(sem título)",
      number:    content.number ?? null,
      url:       content.url ?? null,
      state:     content.state ?? null,
      assignees: (content.assignees?.nodes ?? []).map((a) => a.login),
      labels:    (content.labels?.nodes ?? []).map((l) => ({ name: l.name, color: l.color })),
      status:    statusFV?.name ?? null,
    };
  });

  return {
    items,
    hasNextPage: data.pageInfo.hasNextPage,
    endCursor:   data.pageInfo.endCursor ?? null,
  };
}

export async function listItems(projectId, { first = 30, after = null } = {}) {
  const { githubMethod } = getConfig();
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;
  const variables = { id: projectId, first, after };

  if (githubMethod === "env" || (!githubMethod && token)) {
    return parseItems(await graphQL(ITEMS_QUERY, token, variables));
  }

  const result = spawnSync("gh", ["api", "graphql", "--input", "-"], {
    input:    JSON.stringify({ query: ITEMS_QUERY, variables }),
    encoding: "utf-8",
    timeout:  30000,
    shell:    true,
    env:      ghEnv(),
  });
  if (result.error) throw new Error(`gh CLI: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gh CLI: ${(result.stderr || "").trim()}`);
  return parseItems(JSON.parse(result.stdout));
}
