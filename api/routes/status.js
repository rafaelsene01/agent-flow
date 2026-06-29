import { cpSync, existsSync, mkdtempSync, rmSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { getCache, refresh } from "../modules/status/status.cache.js";
import { PACKAGE_ROOT } from "../paths.js";

export default function statusRoutes(app) {
  app.get("/api/status", (_req, res) => {
    const cached = getCache();
    if (cached) return res.json(cached);
    // Ainda não terminou o warmup — aguarda a primeira leitura real.
    refresh()
      .then((data) => res.json(data))
      .catch((err) => res.status(500).json({ error: err.message }));
  });

  app.post("/api/status", async (_req, res) => {
    try {
      const data = await refresh();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Skills locais são copiadas de dentro do projeto; skills "git" são
  // clonadas de um repositório remoto e o subdiretório indicado é copiado.
  const INSTALLABLE_SKILLS = {
    "tlc-spec-driven":  { type: "local" },
    "spec-driven-eval": { type: "local" },
    "karpathy-guidelines": {
      type: "git",
      repo: "https://github.com/multica-ai/andrej-karpathy-skills.git",
      subdir: join("skills", "karpathy-guidelines"),
    },
    "caveman": {
      type: "git",
      repo: "https://github.com/juliusbrussee/caveman.git",
      subdir: join("skills", "caveman"),
    },
  };

  function installLocal(skill, dest) {
    const src = join(PACKAGE_ROOT, ".claude", "skills", skill);
    if (!existsSync(src)) {
      const err = new Error("Skill não encontrada no projeto.");
      err.statusCode = 404;
      throw err;
    }
    cpSync(src, dest, { recursive: true });
  }

  function installGit(cfg, dest) {
    const tmp = mkdtempSync(join(tmpdir(), "agent-flow-skill-"));
    try {
      execSync(`git clone --depth 1 ${cfg.repo} "${tmp}"`, {
        stdio: "pipe", timeout: 60000,
      });
      const src = join(tmp, cfg.subdir);
      if (!existsSync(src)) {
        const err = new Error("Skill não encontrada no repositório.");
        err.statusCode = 404;
        throw err;
      }
      cpSync(src, dest, { recursive: true });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  app.post("/api/status/install-skill", async (req, res) => {
    const skill = req.body?.skill ?? "tlc-spec-driven";
    const cfg = INSTALLABLE_SKILLS[skill];

    if (!cfg) {
      return res.status(400).json({ error: "Skill inválida." });
    }

    const dest = join(homedir(), ".claude", "skills", skill);

    if (existsSync(dest)) {
      const data = await refresh();
      return res.json(data);
    }

    try {
      if (cfg.type === "git") {
        installGit(cfg, dest);
      } else {
        installLocal(skill, dest);
      }
      const data = await refresh();
      res.json(data);
    } catch (err) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });
}
