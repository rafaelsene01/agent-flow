import { cpSync, existsSync, mkdtempSync, rmSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { getCache, refresh } from "../modules/status/status.cache.js";
import { INSTALLABLE_SKILLS } from "../modules/skills/installable.js";
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

  function installPlugin(cfg) {
    // marketplace add é idempotente do ponto de vista do usuário, mas o CLI
    // retorna erro se já estiver registrado — por isso ignoramos a falha aqui.
    try {
      execSync(`claude plugin marketplace add ${cfg.marketplace}`, {
        stdio: "pipe", timeout: 120000,
      });
    } catch {
      // marketplace provavelmente já adicionado
    }
    execSync(`claude plugin install ${cfg.plugin}`, {
      stdio: "pipe", timeout: 120000,
    });
  }

  app.post("/api/status/install-skill", async (req, res) => {
    const skill = req.body?.skill ?? "tlc-spec-driven";
    const cfg = INSTALLABLE_SKILLS[skill];

    if (!cfg) {
      return res.status(400).json({ error: "Skill inválida." });
    }

    try {
      if (cfg.type === "plugin") {
        installPlugin(cfg);
      } else {
        const dest = join(homedir(), ".claude", "skills", skill);
        if (!existsSync(dest)) {
          if (cfg.type === "git") installGit(cfg, dest);
          else installLocal(skill, dest);
        }
      }
      const data = await refresh();
      res.json(data);
    } catch (err) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });
}
