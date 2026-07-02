import { listRepos }                                  from "../modules/github/github.repos.js";
import { listBoards, listViews, listColumns, listBoardRepos } from "../modules/github/github.boards.js";
import { listItems, listAllItems, listItemsByColumn, listColumnCounts } from "../modules/github/github.items.js";
import { listBranches }                                 from "../modules/github/github.branches.js";
import { setupWorktree }                               from "../modules/git/git.worktree.js";

function sendError(res, err) {
  if (res.headersSent) return;
  res.status(500).json({ error: err?.message ?? String(err) });
}

// Decompõe o filtro da view (repo:/label:/texto livre) usado na filtragem
// server-side dos itens em cache.
function parseViewFilter(viewFilter) {
  if (!viewFilter) return { repoName: null, labels: null, text: null };
  const repoName = viewFilter.match(/repo:([^\s]+)/i)?.[1] ?? null;
  const labels   = viewFilter.match(/label:([^\s]+)/i)?.[1] ?? null;
  const text = viewFilter
    .replace(/-?[\w-]+:[^\s]+/g, " ").replace(/["']/g, " ").replace(/\s+/g, " ").trim() || null;
  return { repoName, labels, text };
}

export default function githubRoutes(app) {
  app.get("/api/github/repos", async (_req, res) => {
    try {
      res.json(await listRepos());
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/github/boards", async (_req, res) => {
    try {
      res.json(await listBoards());
    } catch (err) {
      console.error("[boards]", err.message);
      sendError(res, err);
    }
  });

  app.get("/api/github/boards/:id/items", async (req, res) => {
    try {
      // Teto alto: os itens vêm do cache em memória, então um `first` grande é só
      // uma fatia maior (sem chamadas extras). Permite o auto-refresh silencioso
      // rebuscar de uma vez a janela já carregada (scroll) sem colapsar a coluna.
      const first      = Math.min(parseInt(req.query.first, 10) || 20, 500);
      const after      = req.query.after      || null;
      const columnId   = req.query.columnId   || null;
      const columnName = req.query.columnName || req.query.column || null;
      const { repoName, labels, text } = parseViewFilter(req.query.viewFilter || null);
      const result = (columnId || columnName)
        ? await listItemsByColumn(req.params.id, { columnId, columnName }, { first, after, repoName, labels, text })
        : await listAllItems(req.params.id, { after, repoName, labels, text });
      res.json(result);
    } catch (err) {
      console.error("[items]", err);
      sendError(res, err);
    }
  });

  app.get("/api/github/boards/:id/column-counts", async (req, res) => {
    try {
      const { repoName, labels, text } = parseViewFilter(req.query.viewFilter || null);
      res.json(await listColumnCounts(req.params.id, { repoName, labels, text }));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/github/boards/:id/views", async (req, res) => {
    try {
      res.json(await listViews(req.params.id));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/github/boards/:id/columns", async (req, res) => {
    try {
      res.json(await listColumns(req.params.id));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/github/boards/:id/repos", async (req, res) => {
    try {
      res.json(await listBoardRepos(req.params.id));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/github/repos/:owner/:repo/branches", async (req, res) => {
    try {
      const query = req.query.q || "";
      res.json(await listBranches(req.params.owner, req.params.repo, query));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/github/repos/:owner/:repo/branches", async (req, res) => {
    try {
      const { newBranch, originBranch, cardNumber } = req.body;
      if (!newBranch || !originBranch) {
        return res.status(400).json({ error: "newBranch e originBranch são obrigatórios" });
      }

      if (cardNumber != null) {
        const { worktreeDir, helpersDir, cloned } = await setupWorktree({
          owner:        req.params.owner,
          repo:         req.params.repo,
          newBranch,
          originBranch,
          cardNumber,
        });
        return res.json({ ok: true, worktreeDir, helpersDir, cloned });
      }

      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });
}
