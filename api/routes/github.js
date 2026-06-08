import { listRepos }                        from "../modules/github/github.repos.js";
import { listBoards, listViews, listColumns } from "../modules/github/github.boards.js";
import { listItems, listAllItems, listItemsByColumn } from "../modules/github/github.items.js";

export default function githubRoutes(app) {
  app.get("/api/github/repos", async (_req, res) => {
    try {
      res.json(await listRepos());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/github/boards", async (_req, res) => {
    try {
      const boards = await listBoards();
      res.json(boards);
    } catch (err) {
      console.error("[/api/github/boards]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/github/boards/:id/items", async (req, res) => {
    try {
      const first      = Math.min(parseInt(req.query.first, 10) || 20, 100);
      const after      = req.query.after      || null;
      const columnId   = req.query.columnId   || null;
      const columnName = req.query.columnName || req.query.column || null;
      const repoName   = req.query.repoName   || null;
      const result = (columnId || columnName)
        ? await listItemsByColumn(req.params.id, { columnId, columnName }, { first, after, repoName })
        : await listAllItems(req.params.id, { after, repoName });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/github/boards/:id/views", async (req, res) => {
    try {
      res.json(await listViews(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/github/boards/:id/columns", async (req, res) => {
    try {
      res.json(await listColumns(req.params.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
