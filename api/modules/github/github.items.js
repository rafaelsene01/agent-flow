import fs   from "fs";
import os   from "os";
import path from "path";
import { graphQL, getToken } from "./github.client.js";

const CACHE_DIR = path.join(os.homedir(), ".agent-flow", "cache");

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
              title number body
              repository { nameWithOwner }
              assignees(first: 3) { nodes { login avatarUrl } }
              labels(first: 20) { nodes { name color } }
            }
            ... on PullRequest {
              title number body
              repository { nameWithOwner }
              assignees(first: 3) { nodes { login avatarUrl } }
              labels(first: 20) { nodes { name color } }
            }
            ... on DraftIssue { title body }
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
    const typeFV = fvNodes.find((fv) => fv?.field?.name?.toLowerCase() === "type")
                ?? fvNodes.find((fv) => fv?.field?.name?.toLowerCase() === "issue type")
                ?? fvNodes.find((fv) => fv?.field?.name?.toLowerCase() === "item type");
    const itemType = typeFV?.name ?? typeFV?.text ?? null;
    return {
      id:             node.id,
      type:           content.__typename ?? "Unknown",
      itemType,
      title:          content.title ?? "(sem título)",
      number:         content.number ?? null,
      body:           content.body ?? null,
      assignees:      (content.assignees?.nodes ?? []).map((a) => ({ login: a.login, avatarUrl: a.avatarUrl ?? null })),
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

// ── Cache de itens por projeto ─────────────────────────────────────────────
// A API ProjectV2 do GitHub não filtra itens por repo/label/texto, então todo
// filtro é feito no servidor sobre a lista completa. Sem cache, cada coluna do
// board disparava sua própria varredura do projeto inteiro (dezenas de chamadas
// GraphQL em paralelo), estourando o rate limit. Buscamos o projeto UMA vez e
// servimos todas as colunas, filtros e páginas a partir dessa lista.
//
// Como a varredura é limitada pela latência do GitHub (~1.8s/página × ~30 páginas
// ≈ 30s, independente do payload), nunca deixamos o usuário esperar por ela:
//   • stale-while-revalidate — havendo cache (mesmo vencido), retorna na hora e
//     revalida em background; só bloqueia na primeiríssima vez, sem cache nenhum;
//   • persistência em disco — o cache sobrevive a restarts do servidor;
//   • warm no boot — a varredura começa quando a API sobe (ver warmItemsCache).
const CACHE_TTL_MS = 60_000;
const FETCH_MAX_PAGES = 100; // teto de segurança: até 10k itens por projeto

const _cache    = new Map(); // projectId -> { items, ts }
const _inflight = new Map(); // projectId -> Promise<items> (dedupe de concorrência)

async function fetchPage(token, variables, attempt = 0) {
  try {
    return parseItems(await graphQL(ITEMS_QUERY, token, variables));
  } catch (err) {
    // TypeError cobre "fetch failed" e "terminated" (erros de rede do undici).
    // Tentamos até 2 vezes com backoff crescente antes de desistir.
    if (attempt < 2 && err instanceof TypeError) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return fetchPage(token, variables, attempt + 1);
    }
    throw err;
  }
}

async function fetchAllPages(projectId) {
  const token = getToken();
  if (!token) throw new Error("GitHub não autenticado. Configure GH_TOKEN ou execute 'gh auth login'.");
  const all = [];
  let after = null, hasMore = true, pages = 0;
  while (hasMore && pages < FETCH_MAX_PAGES) {
    const page = await fetchPage(token, { id: projectId, first: 100, after });
    all.push(...page.items);
    hasMore = page.hasNextPage;
    after   = page.endCursor;
    pages++;
  }
  return all;
}

const _diskPath = (projectId) => path.join(CACHE_DIR, `items-${projectId}.json`);

async function loadDisk(projectId) {
  try {
    const { items, ts } = JSON.parse(await fs.promises.readFile(_diskPath(projectId), "utf-8"));
    if (Array.isArray(items)) return { items, ts: ts || 0 };
  } catch { /* sem cache em disco ou inválido */ }
  return null;
}

async function saveDisk(projectId, entry) {
  try {
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    await fs.promises.writeFile(_diskPath(projectId), JSON.stringify(entry));
  } catch (err) {
    console.error("[items] erro ao gravar cache em disco:", err.message);
  }
}

// Dispara (ou reusa) uma varredura completa, atualizando memória e disco.
function refreshInBackground(projectId) {
  if (_inflight.has(projectId)) return _inflight.get(projectId);
  const p = fetchAllPages(projectId)
    .then((items) => {
      const entry = { items, ts: Date.now() };
      _cache.set(projectId, entry);
      saveDisk(projectId, entry); // fire-and-forget
      return items;
    })
    .finally(() => { _inflight.delete(projectId); });
  _inflight.set(projectId, p);
  return p;
}

// Retorna todos os itens do projeto. Serve cache fresco direto; cache vencido
// (memória ou disco) é servido na hora com revalidação em background; só bloqueia
// quando não há cache algum.
async function getAllProjectItems(projectId) {
  let entry = _cache.get(projectId);
  if (!entry) {
    const disk = await loadDisk(projectId);
    if (disk) { _cache.set(projectId, disk); entry = disk; }
  }
  if (entry) {
    // Revalidação em background: nunca propaga rejeição (ex: 401 por token
    // rotacionado), senão uma unhandled rejection derruba o processo.
    if (Date.now() - entry.ts >= CACHE_TTL_MS) {
      refreshInBackground(projectId).catch((err) =>
        console.error("[items] erro na revalidação em background:", err.message),
      );
    }
    return entry.items;
  }
  return refreshInBackground(projectId);
}

// Pré-aquece o cache de um projeto (chamado no boot do servidor para cada board).
// Sempre força uma busca fresca no GitHub, independente da idade do cache em disco,
// para que um restart do servidor sempre recarregue os cards.
export function warmItemsCache(projectId) {
  if (!projectId) return;
  refreshInBackground(projectId).catch((err) => console.error("[items] erro no warm:", err.message));
}

// Polling contínuo em background: revalida os cards de todos os boards em
// intervalos regulares, mesmo sem ninguém acessando, para mantê-los sempre
// frescos. O boot faz o primeiro warm (warmItemsCache); este loop mantém a
// atualização periódica dali em diante. O dedupe de refreshInBackground evita
// buscas sobrepostas caso uma varredura demore mais que o intervalo.
const POLL_INTERVAL_MS = 60_000;
let _pollTimer = null;

// getBoardIds é um callback (lido a cada tick) para que boards adicionados em
// runtime também passem a ser revalidados sem reiniciar o servidor.
export function startItemsPolling(getBoardIds, intervalMs = POLL_INTERVAL_MS) {
  if (_pollTimer) return _pollTimer;
  _pollTimer = setInterval(() => {
    for (const id of getBoardIds() ?? []) warmItemsCache(id);
  }, intervalMs);
  // unref: o loop não deve, sozinho, impedir o processo de encerrar.
  _pollTimer.unref?.();
  return _pollTimer;
}

export function stopItemsPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// Invalida o cache em memória (ex: após mover um card). Sem argumento, limpa tudo.
export function clearItemsCache(projectId) {
  if (projectId) _cache.delete(projectId);
  else _cache.clear();
}

function repoMatches(itemRepo, repoFilter) {
  if (!repoFilter) return true;
  // Filtro de repo ativo: drafts (sem repositório, sem número) não pertencem a
  // repo nenhum, então não devem aparecer.
  if (!itemRepo) return false;
  return repoFilter.split(",").some((r) => r.trim() === itemRepo);
}

function labelsMatch(itemLabels, labelFilter) {
  if (!labelFilter) return true;
  const wanted = labelFilter.split(",").map((l) => l.trim().toLowerCase());
  return wanted.some((w) => itemLabels.some((l) => l.name.toLowerCase() === w));
}

// Busca por texto livre: cada palavra precisa aparecer no título (substring,
// case-insensitive) ou bater exatamente com o número do card (ex: "42" ou "#42").
function textMatches(item, text) {
  if (!text) return true;
  const title  = (item.title ?? "").toLowerCase();
  const number = item.number != null ? String(item.number) : "";
  return text.toLowerCase().split(/\s+/).filter(Boolean).every((w) => {
    const term = w.replace(/^#/, "");
    return title.includes(term) || (number !== "" && number === term);
  });
}

function matchesFilters(item, { repoName, labels, text }) {
  return repoMatches(item._repoName, repoName)
      && labelsMatch(item.labels, labels)
      && textMatches(item, text);
}

// Paginação por offset sobre a lista filtrada em memória. O cursor é só o índice
// do próximo item; o frontend o devolve em `after` transparentemente.
function paginate(list, after, first) {
  const offset = after ? Math.max(0, parseInt(after, 10) || 0) : 0;
  const slice  = list.slice(offset, offset + first);
  const nextOffset  = offset + slice.length;
  const hasNextPage = nextOffset < list.length;
  return { slice, hasNextPage, endCursor: hasNextPage ? String(nextOffset) : null };
}

function toClientItem({ id, type, itemType, title, number, body, assignees, labels }) {
  return { id, type, itemType, title, number, body, assignees, labels };
}

function toClientItemWithColumn({ id, type, itemType, title, number, body, assignees, labels, _status, _statusOptionId }) {
  return { id, type, itemType, title, number, body, assignees, labels, columnName: _status, columnId: _statusOptionId };
}

export async function listItems(projectId, { first = 30, after = null, repoName = null, labels = null, text = null } = {}) {
  const all     = await getAllProjectItems(projectId);
  const matched = all.filter((i) => matchesFilters(i, { repoName, labels, text }));
  const { slice, hasNextPage, endCursor } = paginate(matched, after, first);
  return { items: slice.map(toClientItem), hasNextPage, endCursor };
}

export async function listAllItems(projectId, { first = 50, after = null, repoName = null, labels = null, text = null } = {}) {
  const all     = await getAllProjectItems(projectId);
  const matched = all.filter((i) => matchesFilters(i, { repoName, labels, text }));
  const { slice, hasNextPage, endCursor } = paginate(matched, after, first);
  return { items: slice.map(toClientItemWithColumn), hasNextPage, endCursor };
}

// Contagem de cards por coluna, servida do mesmo cache em memória usado pelas
// colunas do board (sem chamadas extras ao GitHub). Espelha o limite de 20 do
// fetch por coluna: a contagem é limitada a 20, deixando o "+" a cargo do cliente.
const COLUMN_COUNT_CAP = 20;

export async function listColumnCounts(projectId, { repoName = null, labels = null, text = null } = {}) {
  const all = await getAllProjectItems(projectId);
  const byId = {};
  const byName = {};
  for (const item of all) {
    if (!matchesFilters(item, { repoName, labels, text })) continue;
    if (item._statusOptionId) byId[item._statusOptionId] = (byId[item._statusOptionId] ?? 0) + 1;
    if (item._status) {
      const key = item._status.toLowerCase();
      byName[key] = (byName[key] ?? 0) + 1;
    }
  }
  const cap = (map) => { for (const key in map) if (map[key] > COLUMN_COUNT_CAP) map[key] = COLUMN_COUNT_CAP; };
  cap(byId);
  cap(byName);
  return { byId, byName };
}

export async function listItemsByColumn(projectId, { columnId, columnName }, { first = 20, after = null, repoName = null, labels = null, text = null } = {}) {
  const all = await getAllProjectItems(projectId);
  const matched = all.filter((item) => {
    if (!matchesFilters(item, { repoName, labels, text })) return false;
    const matchById   = columnId   && item._statusOptionId === columnId;
    const matchByName = columnName && item._status?.toLowerCase() === columnName.toLowerCase();
    return matchById || (!columnId && matchByName) || (columnId && !item._statusOptionId && matchByName);
  });
  const { slice, hasNextPage, endCursor } = paginate(matched, after, first);
  return { items: slice.map(toClientItem), hasNextPage, endCursor };
}
