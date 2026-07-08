// Rotas neutras de Repo (host de código) — REQ-4.
// Despacha por host via repoRegistry; a clone URL autenticada vem do provider e é
// injetada no git seam (setupWorktree). Nada aqui conhece "github".

import { get as getRepo, list as listRepoHosts } from "../modules/repos/repos.registry.js";
import { setupWorktree } from "../modules/git/git.worktree.js";

function sendError(res, err) {
  if (res.headersSent) return;
  res.status(500).json({ error: err?.message ?? String(err) });
}

export default function reposRoutes(app) {
  // Repos agregados de todos os hosts registrados (host default primeiro).
  app.get("/api/repos", async (_req, res) => {
    try {
      const all = [];
      for (const host of listRepoHosts()) {
        try {
          const repos = await getRepo(host).listRepos();
          for (const r of repos) all.push({ host, ...r });
        } catch (err) {
          console.error(`[repos] ${host}:`, err.message);
        }
      }
      res.json(all);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/repos/:host/:owner/:repo/branches", async (req, res) => {
    try {
      const query = req.query.q || "";
      res.json(await getRepo(req.params.host).listBranches(req.params.owner, req.params.repo, query));
    } catch (err) {
      sendError(res, err);
    }
  });

  // Cria branch + (se cardNumber) worktree. Espelha a rota antiga: a branch nasce
  // do `git worktree add -b`; a clone URL vem do RepoProvider do host.
  app.post("/api/repos/:host/:owner/:repo/branches", async (req, res) => {
    try {
      const { host, owner, repo } = req.params;
      const { newBranch, originBranch, cardNumber } = req.body;
      if (!newBranch || !originBranch) {
        return res.status(400).json({ error: "newBranch e originBranch são obrigatórios" });
      }

      if (cardNumber != null) {
        const cloneUrl = getRepo(host).getCloneUrl({ owner, repo });
        const { worktreeDir, helpersDir, cloned } = await setupWorktree({
          host, owner, repo, cloneUrl, newBranch, originBranch, cardNumber,
        });
        return res.json({ ok: true, worktreeDir, helpersDir, cloned });
      }

      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Repos de um host específico.
  app.get("/api/repos/:host", async (req, res) => {
    try {
      res.json(await getRepo(req.params.host).listRepos());
    } catch (err) {
      sendError(res, err);
    }
  });
}
