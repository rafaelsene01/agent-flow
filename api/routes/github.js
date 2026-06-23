import { listRepos }                                  from "../modules/github/github.repos.js";
import { listBoards, listViews, listColumns, listBoardRepos } from "../modules/github/github.boards.js";
import { listItems, listAllItems, listItemsByColumn }  from "../modules/github/github.items.js";
import { listBranches }                                 from "../modules/github/github.branches.js";
import { setupWorktree }                               from "../modules/git/git.worktree.js";

function sendError(res, err) {
  if (res.headersSent) return;
  res.status(500).json({ error: err?.message ?? String(err) });
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
      const first      = Math.min(parseInt(req.query.first, 10) || 20, 100);
      const after      = req.query.after      || null;
      const columnId   = req.query.columnId   || null;
      const columnName = req.query.columnName || req.query.column || null;
      const viewFilter = req.query.viewFilter || null;
      const repoName   = viewFilter ? (viewFilter.match(/repo:([^\s]+)/i)?.[1] ?? null) : null;
      const labels     = viewFilter ? (viewFilter.match(/label:([^\s]+)/i)?.[1] ?? null) : null;
      // Texto livre: tudo que não é um qualificador `chave:valor` vira busca por título.
      const text = viewFilter
        ? (viewFilter.replace(/-?[\w-]+:[^\s]+/g, " ").replace(/["']/g, " ").replace(/\s+/g, " ").trim() || null)
        : null;
      const result = (columnId || columnName)
        ? await listItemsByColumn(req.params.id, { columnId, columnName }, { first, after, repoName, labels, text })
        : await listAllItems(req.params.id, { after, repoName, labels, text });
      res.json(result);
    } catch (err) {
      console.error("[items]", err);
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
      res.json(await listBranches(req.params.owner, req.params.repo));
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
