import { cpSync, existsSync, mkdtempSync, rmSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { refresh } from "../modules/status/status.cache.js";
import { INSTALLABLE_SKILLS } from "../modules/skills/installable.js";
import { PACKAGE_ROOT } from "../paths.js";

export default function statusRoutes(app) {
  app.get("/api/status", (_req, res) => {
    // Sempre revalida: a tela consulta uma vez ao abrir, e um snapshot cacheado
    // congelava erros transitórios (GitHub 503 no boot ficava para sempre).
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

  // Skill genérica (fora do catálogo, ex.: criada pelo usuário): copia de
  // <pacote>/.claude/skills/<skill> para o Claude global.
  function installProjectSkill(skill, dest) {
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
    const force = req.body?.force === true;

    if (typeof skill !== "string" || !/^[a-zA-Z0-9._-]+$/.test(skill)) {
      return res.status(400).json({ error: "Skill inválida." });
    }
    const cfg = INSTALLABLE_SKILLS[skill];

    try {
      const dest = join(homedir(), ".claude", "skills", skill);
      // "Atualizar" (force) remove a cópia global antes de reinstalar.
      if (force && existsSync(dest)) rmSync(dest, { recursive: true, force: true });
      if (!existsSync(dest)) {
        if (cfg?.type === "git") installGit(cfg, dest);
        else if (cfg?.type === "local") installLocal(skill, dest);
        else installProjectSkill(skill, dest); // genérica: copia do projeto
      }
      const data = await refresh();
      res.json(data);
    } catch (err) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });
}
