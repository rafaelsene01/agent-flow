import { listRepos }                        from "../modules/github/github.repos.js";
import { listBoards, listViews, listColumns } from "../modules/github/github.boards.js";
import { listItems }                         from "../modules/github/github.items.js";

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
      const first = Math.min(parseInt(req.query.first, 10) || 30, 100);
      const after = req.query.after || null;
      res.json(await listItems(req.params.id, { first, after }));
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
