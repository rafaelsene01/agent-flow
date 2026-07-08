// SourceProvider "github-board" — monta o objeto-contrato reusando as funções
// já existentes do módulo github (boards/items/service). Sem reescrever lógica.
// Contrato: ../sources/sources.contract.js · Regras: docs/providers.md.

import { getStatus } from "./github.service.js";
import { listBoards, listViews, listColumns, listBoardRepos } from "./github.boards.js";
import {
  listAllItems,
  listItemsByColumn,
  listColumnCounts,
  warmItemsCache,
  startItemsPolling,
} from "./github.items.js";

function parseFullName(fullName) {
  if (!fullName || !fullName.includes("/")) return null;
  const [owner, repo] = fullName.split("/");
  return { host: "github", owner, repo };
}

export const githubSource = {
  name: "github-board",

  getStatus,
  listBoards,
  listColumns,
  listViews,

  // Delegam para as funções atuais mantendo o shape de retorno idêntico
  // ({ items, hasNextPage, endCursor }) para zero regressão no frontend.
  // listItems → listAllItems: a visão "todos os itens" do board carrega os cards
  // COM columnId/columnName (contrato Card, REQ-7), como a rota antiga fazia.
  listItems: listAllItems,
  listItemsByColumn,
  listColumnCounts,

  // Repos vinculáveis: superset — mantém o shape antigo ({name,fullName,url})
  // e acrescenta {host,owner,repo} do contrato, sem quebrar consumidores atuais.
  async listLinkableRepos(boardId) {
    const repos = await listBoardRepos(boardId);
    return repos.map((r) => ({ ...r, ...parseFullName(r.fullName) }));
  },

  // Desacopla card de repo (REQ-6). GitHub carrega owner/repo no próprio item
  // (_repoName = nameWithOwner, campo server-side). Sem repo no card, cai para o
  // primeiro repo vinculado ao board.
  resolveRepoRef(card, board) {
    const full = card?._repoName || card?.repoFullName || null;
    const fromCard = parseFullName(full);
    if (fromCard) return fromCard;
    const linked = board?.repos?.[0];
    if (linked) return { host: linked.host ?? "github", owner: linked.owner, repo: linked.repo };
    return null;
  },

  // Cache de items (opcionais no contrato) — mantidos dentro do github-source.
  warm: warmItemsCache,
  startPolling: startItemsPolling,
};
