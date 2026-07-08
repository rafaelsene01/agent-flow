// Rotas neutras de Source (fonte de cards) — REQ-4.
// Despacha por provider via sourceRegistry; nada aqui conhece "github".
// `/api/sources/:id/*` resolve o source do board pela config; discovery usa
// `:source` explícito. Ver docs/providers.md e design.md#rotas-neutras-req-4.

import { get as getSource, list as listSources } from "../modules/sources/sources.registry.js";
import { getConfig } from "../modules/config/config.service.js";

function sendError(res, err) {
  if (res.headersSent) return;
  res.status(500).json({ error: err?.message ?? String(err) });
}

// Decompõe o filtro da view (repo:/label:/texto livre) — igual à rota antiga.
function parseViewFilter(viewFilter) {
  if (!viewFilter) return { repoName: null, labels: null, text: null };
  const repoName = viewFilter.match(/repo:([^\s]+)/i)?.[1] ?? null;
  const labels   = viewFilter.match(/label:([^\s]+)/i)?.[1] ?? null;
  const text = viewFilter
    .replace(/-?[\w-]+:[^\s]+/g, " ").replace(/["']/g, " ").replace(/\s+/g, " ").trim() || null;
  return { repoName, labels, text };
}

// Resolve o SourceProvider de um board pelo id, lendo board.source da config
// (default "github-board" via normalizeBoard). Erro claro se o board não existe.
function providerForBoard(boardId) {
  const board = (getConfig().boards ?? []).find((b) => b.id === boardId);
  if (!board) throw new Error(`UNKNOWN_BOARD:${boardId}`);
  return getSource(board.source);
}

export default function sourcesRoutes(app) {
  // Providers disponíveis + status de cada um.
  app.get("/api/sources", async (_req, res) => {
    try {
      const out = [];
      for (const name of listSources()) {
        let status;
        try { status = await getSource(name).getStatus(); }
        catch (err) { status = { connected: false, error: err.message }; }
        out.push({ source: name, status });
      }
      res.json(out);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Discovery: boards conectáveis de um source específico (:source explícito).
  app.get("/api/sources/:source/boards", async (req, res) => {
    try {
      res.json(await getSource(req.params.source).listBoards());
    } catch (err) {
      console.error("[sources/boards]", err.message);
      sendError(res, err);
    }
  });

  app.get("/api/sources/:id/items", async (req, res) => {
    try {
      const first      = Math.min(parseInt(req.query.first, 10) || 20, 500);
      const after      = req.query.after      || null;
      const columnId   = req.query.columnId   || null;
      const columnName = req.query.columnName || req.query.column || null;
      const force      = req.query.refresh === "1" || req.query.refresh === "true";
      const { repoName, labels, text } = parseViewFilter(req.query.viewFilter || null);
      const provider = providerForBoard(req.params.id);
      const result = (columnId || columnName)
        ? await provider.listItemsByColumn(req.params.id, { columnId, columnName }, { first, after, repoName, labels, text, force })
        : await provider.listItems(req.params.id, { after, repoName, labels, text, force });
      res.json(result);
    } catch (err) {
      console.error("[sources/items]", err);
      sendError(res, err);
    }
  });

  app.get("/api/sources/:id/column-counts", async (req, res) => {
    try {
      const { repoName, labels, text } = parseViewFilter(req.query.viewFilter || null);
      res.json(await providerForBoard(req.params.id).listColumnCounts(req.params.id, { repoName, labels, text }));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/sources/:id/views", async (req, res) => {
    try {
      res.json(await providerForBoard(req.params.id).listViews(req.params.id));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/sources/:id/columns", async (req, res) => {
    try {
      res.json(await providerForBoard(req.params.id).listColumns(req.params.id));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/sources/:id/repos", async (req, res) => {
    try {
      res.json(await providerForBoard(req.params.id).listLinkableRepos(req.params.id));
    } catch (err) {
      sendError(res, err);
    }
  });
}
