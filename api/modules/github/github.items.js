import { spawn } from "child_process";
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

// Versão assíncrona da chamada ao gh CLI — não bloqueia o event loop.
function ghGraphQL(query, variables) {
  return new Promise((resolve, reject) => {
    const proc = spawn("gh", ["api", "graphql", "--input", "-"], {
      shell: true,
      env:   ghEnv(),
    });

    const out = [];
    const err = [];
    let settled = false;

    const finish = (fn) => { if (!settled) { settled = true; fn(); } };

    const timer = setTimeout(() => {
      finish(() => { proc.kill(); reject(new Error("gh CLI: timeout")); });
    }, 30000);

    proc.stdout.on("data", (d) => out.push(d));
    proc.stderr.on("data", (d) => err.push(d));
    proc.on("error", (e) => finish(() => { clearTimeout(timer); reject(new Error(`gh CLI: ${e.message}`)); }));
    proc.on("close", (code) => {
      clearTimeout(timer);
      finish(() => {
        if (code !== 0) {
          reject(new Error(`gh CLI: ${Buffer.concat(err).toString().trim()}`));
        } else {
          try { resolve(JSON.parse(Buffer.concat(out).toString())); }
          catch { reject(new Error("gh CLI: resposta inválida")); }
        }
      });
    });

    proc.stdin.write(JSON.stringify({ query, variables }));
    proc.stdin.end();
  });
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
              title number
              repository { nameWithOwner }
              assignees(first: 3) { nodes { login } }
              labels(first: 5) { nodes { name color } }
            }
            ... on PullRequest {
              title number
              repository { nameWithOwner }
              assignees(first: 3) { nodes { login } }
              labels(first: 5) { nodes { name color } }
            }
            ... on DraftIssue { title }
          }
          fieldValues(first: 30) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                optionId
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
    const fvNodes = node.fieldValues?.nodes ?? [];
    const statusFV =
      fvNodes.find((fv) => fv?.field?.name?.toLowerCase() === "status") ??
      fvNodes.find((fv) => fv?.field?.name != null);
    return {
      id:             node.id,
      type:           content.__typename ?? "Unknown",
      title:          content.title ?? "(sem título)",
      number:         content.number ?? null,
      assignees:      (content.assignees?.nodes ?? []).map((a) => a.login),
      labels:         (content.labels?.nodes ?? []).map((l) => ({ name: l.name, color: l.color })),
      // campos usados apenas no servidor para filtragem — removidos antes de enviar ao cliente
      _repoName:       content.repository?.nameWithOwner ?? null,
      _status:         statusFV?.name     ?? null,
      _statusOptionId: statusFV?.optionId ?? null,
    };
  });

  return {
    items,
    hasNextPage: data.pageInfo.hasNextPage,
    endCursor:   data.pageInfo.endCursor ?? null,
  };
}

async function fetchPage(projectId, variables) {
  const { githubMethod } = getConfig();
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;

  if (githubMethod === "env" || (!githubMethod && token)) {
    return parseItems(await graphQL(ITEMS_QUERY, token, variables));
  }

  return parseItems(await ghGraphQL(ITEMS_QUERY, variables));
}

function toClientItem({ id, type, title, number, assignees, labels }) {
  return { id, type, title, number, assignees, labels };
}

function toClientItemWithColumn({ id, type, title, number, assignees, labels, _status, _statusOptionId }) {
  return { id, type, title, number, assignees, labels, columnName: _status, columnId: _statusOptionId };
}

export async function listItems(projectId, { first = 30, after = null, repoName = null } = {}) {
  const page = await fetchPage(projectId, { id: projectId, first, after });
  const items = page.items
    .filter((i) => !repoName || !i._repoName || i._repoName === repoName)
    .map(toClientItem);
  return { ...page, items };
}

// Busca todas as páginas de uma vez (até 10 páginas / 1000 itens).
// Se chamado com `after`, busca apenas a próxima página (modo scroll).
export async function listAllItems(projectId, { after = null, repoName = null } = {}) {
  const allItems = [];
  let cursor  = after;
  let hasMore = true;
  let pages   = 0;
  const MAX_PAGES = after ? 1 : 10;

  while (hasMore && pages < MAX_PAGES) {
    const page = await fetchPage(projectId, { id: projectId, first: 100, after: cursor });
    pages++;
    const filtered = page.items
      .filter((i) => !repoName || !i._repoName || i._repoName === repoName)
      .map(toClientItemWithColumn);
    allItems.push(...filtered);
    hasMore = page.hasNextPage;
    cursor  = page.endCursor;
  }

  return { items: allItems, hasNextPage: hasMore, endCursor: cursor ?? null };
}

// Cursor format: null | "<githubCursor>" | "<githubCursor>|<skip>" | "|<skip>"
// githubCursor = posição global no projeto; skip = matches a pular na primeira página desse cursor.
// Isso evita re-buscar do início a cada página — só re-busca 1 página quando há overflow.
function parseCursor(after) {
  if (!after) return { globalCursor: null, skip: 0 };
  const pipeIdx = after.indexOf("|");
  if (pipeIdx >= 0 && /^\d+$/.test(after.slice(pipeIdx + 1))) {
    return {
      globalCursor: after.slice(0, pipeIdx) || null,
      skip:         parseInt(after.slice(pipeIdx + 1), 10),
    };
  }
  return { globalCursor: after, skip: 0 };
}

export async function listItemsByColumn(projectId, { columnId, columnName }, { first = 20, after = null, repoName = null } = {}) {
  const { globalCursor, skip } = parseCursor(after);

  const collected = [];
  let cursor   = globalCursor;
  let hasMore  = true;
  let pages    = 0;
  const MAX_PAGES = 10;
  let isFirstPage = true;
  let skipped     = 0;

  // Dados da última página para calcular o cursor de paginação seguinte.
  let lastPageCursorBefore = globalCursor;
  let lastPageTotalMatches = 0; // matches após aplicar skip inicial
  let lastPageConsumed     = 0;
  let lastPageWasFirst     = false;

  while (collected.length < first && hasMore && pages < MAX_PAGES) {
    const page = await fetchPage(projectId, { id: projectId, first: 50, after: cursor });
    pages++;

    lastPageCursorBefore = cursor;
    lastPageTotalMatches = 0;
    lastPageConsumed     = 0;
    lastPageWasFirst     = isFirstPage;

    for (const item of page.items) {
      if (repoName && item._repoName && item._repoName !== repoName) continue;
      const matchById   = columnId   && item._statusOptionId === columnId;
      const matchByName = columnName && item._status?.toLowerCase() === columnName.toLowerCase();
      const match = matchById || (!columnId && matchByName) || (columnId && !item._statusOptionId && matchByName);
      if (!match) continue;

      // Pula os primeiros `skip` matches apenas na primeira página buscada.
      if (isFirstPage && skipped < skip) { skipped++; continue; }

      lastPageTotalMatches++;
      if (collected.length < first) {
        collected.push(item);
        lastPageConsumed++;
      }
    }

    isFirstPage = false;
    cursor  = page.endCursor;
    hasMore = page.hasNextPage;
  }

  if (collected.length < first) {
    return { items: collected.map(toClientItem), hasNextPage: false, endCursor: null };
  }

  const leftover  = lastPageTotalMatches - lastPageConsumed;
  const moreExist = leftover > 0 || hasMore;

  if (!moreExist) {
    return { items: collected.map(toClientItem), hasNextPage: false, endCursor: null };
  }

  let endCursor;
  if (leftover > 0) {
    // Overflow na última página: próxima requisição recomeça nessa página com skip.
    const nextSkip = lastPageWasFirst ? skip + lastPageConsumed : lastPageConsumed;
    endCursor = lastPageCursorBefore
      ? `${lastPageCursorBefore}|${nextSkip}`
      : `|${nextSkip}`;
  } else {
    // Sem overflow: próxima requisição começa do cursor após a última página.
    endCursor = cursor;
  }

  return { items: collected.map(toClientItem), hasNextPage: true, endCursor };
}
