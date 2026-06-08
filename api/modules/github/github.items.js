import { graphQL, getToken } from "./github.client.js";

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
              labels(first: 20) { nodes { name color } }
            }
            ... on PullRequest {
              title number
              repository { nameWithOwner }
              assignees(first: 3) { nodes { login } }
              labels(first: 20) { nodes { name color } }
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
  const token = getToken();
  if (!token) throw new Error("GitHub não autenticado. Configure GH_TOKEN ou execute 'gh auth login'.");
  return parseItems(await graphQL(ITEMS_QUERY, token, variables));
}

function repoMatches(itemRepo, repoFilter) {
  if (!repoFilter || !itemRepo) return true;
  return repoFilter.split(",").some((r) => r.trim() === itemRepo);
}

function labelsMatch(itemLabels, labelFilter) {
  if (!labelFilter) return true;
  const wanted = labelFilter.split(",").map((l) => l.trim().toLowerCase());
  return wanted.some((w) => itemLabels.some((l) => l.name.toLowerCase() === w));
}

function toClientItem({ id, type, title, number, assignees, labels }) {
  return { id, type, title, number, assignees, labels };
}

function toClientItemWithColumn({ id, type, title, number, assignees, labels, _status, _statusOptionId }) {
  return { id, type, title, number, assignees, labels, columnName: _status, columnId: _statusOptionId };
}

export async function listItems(projectId, { first = 30, after = null, repoName = null, labels = null } = {}) {
  const page = await fetchPage(projectId, { id: projectId, first, after });
  const items = page.items
    .filter((i) => repoMatches(i._repoName, repoName) && labelsMatch(i.labels, labels))
    .map(toClientItem);
  return { ...page, items };
}

// Busca todas as páginas de uma vez (até 10 páginas / 1000 itens).
// Se chamado com `after`, busca apenas a próxima página (modo scroll).
export async function listAllItems(projectId, { after = null, repoName = null, labels = null } = {}) {
  const allItems = [];
  let cursor  = after;
  let hasMore = true;
  let pages   = 0;
  const MAX_PAGES = after ? 1 : 10;

  while (hasMore && pages < MAX_PAGES) {
    const page = await fetchPage(projectId, { id: projectId, first: 100, after: cursor });
    pages++;
    const filtered = page.items
      .filter((i) => repoMatches(i._repoName, repoName) && labelsMatch(i.labels, labels))
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

export async function listItemsByColumn(projectId, { columnId, columnName }, { first = 20, after = null, repoName = null, labels = null } = {}) {
  const { globalCursor, skip } = parseCursor(after);

  const collected = [];
  let cursor   = globalCursor;
  let hasMore  = true;
  let pages    = 0;
  const MAX_PAGES = 20;
  let isFirstPage = true;
  let skipped     = 0;

  // Dados da última página para calcular o cursor de paginação seguinte.
  let lastPageCursorBefore = globalCursor;
  let lastPageTotalMatches = 0; // matches após aplicar skip inicial
  let lastPageConsumed     = 0;
  let lastPageWasFirst     = false;

  while (collected.length < first && hasMore && pages < MAX_PAGES) {
    const page = await fetchPage(projectId, { id: projectId, first: 100, after: cursor });
    pages++;

    lastPageCursorBefore = cursor;
    lastPageTotalMatches = 0;
    lastPageConsumed     = 0;
    lastPageWasFirst     = isFirstPage;

    for (const item of page.items) {
      if (!repoMatches(item._repoName, repoName) || !labelsMatch(item.labels, labels)) continue;
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
    // Esgotamos as páginas (MAX_PAGES ou fim do projeto).
    // Se o GitHub ainda tem páginas, preserva o cursor para o scroll carregar o restante.
    return { items: collected.map(toClientItem), hasNextPage: hasMore, endCursor: hasMore ? cursor : null };
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
