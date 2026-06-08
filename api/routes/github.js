import { listRepos }   from "../modules/github/github.repos.js";
import { listBoards } from "../modules/github/github.boards.js";

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
}
