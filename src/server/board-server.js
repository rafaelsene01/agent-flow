import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import express from "express";
import * as github from "../git/github.js";
import * as linear from "../sources/linear.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const WEB_DIST_DIR = path.resolve(__dirname, "../../web/out");

async function getGithubStatus() {
  // 1. Env token
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (envToken) {
    try {
      const user = await github.validateToken(envToken);
      return { connected: true, method: "env", user: user.login, name: user.name };
    } catch {
      return { connected: false, method: "env", error: "Token inválido" };
    }
  }

  // 2. gh CLI
  let ghInstalled = false;
  try {
    execSync("gh --version", { stdio: "pipe", timeout: 3000 });
    ghInstalled = true;
  } catch {}

  if (ghInstalled) {
    try {
      const out = execSync("gh api user", { stdio: "pipe", encoding: "utf-8", timeout: 8000 });
      const user = JSON.parse(out);
      return { connected: true, method: "gh-cli", user: user.login, name: user.name };
    } catch {
      return { connected: false, ghInstalled: true, error: "Não autenticado" };
    }
  }

  // 3. SSH key for github.com
  try {
    const out = execSync(
      "ssh -T -o StrictHostKeyChecking=no -o BatchMode=yes git@github.com",
      { stdio: "pipe", encoding: "utf-8", timeout: 8000 }
    );
    const match = (out || "").match(/Hi (.+?)!/);
    if (match) return { connected: true, method: "ssh", user: match[1] };
  } catch (err) {
    // ssh returns exit code 1 even on success ("Hi user! You've authenticated...")
    const stderr = err.stderr?.toString() || "";
    const match = stderr.match(/Hi (.+?)!/);
    if (match) return { connected: true, method: "ssh", user: match[1] };
  }

  return { connected: false, ghInstalled: false };
}

async function getClaudeStatus() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      if (res.ok) return { connected: true, method: "env" };
      return { connected: false, method: "env", error: "API key inválida" };
    } catch {
      return { connected: false, method: "env", error: "Sem conexão com Anthropic" };
    }
  }
  try {
    const version = execSync("claude --version", {
      stdio: "pipe", encoding: "utf-8", timeout: 5000,
    }).trim();
    return { connected: true, method: "claude-cli", version };
  } catch {
    return { connected: false };
  }
}

export async function startBoardServer({ config: initialConfig, teamId: initialTeamId, fetchBoard, port, configPath }) {
  if (!fs.existsSync(WEB_DIST_DIR)) {
    throw new Error(
      `Frontend não encontrado em ${WEB_DIST_DIR}\n` +
      `  Execute "npm run build:web" dentro do repositório antes de usar.`
    );
  }

  let liveConfig = initialConfig ? { ...initialConfig } : null;
  let liveTeamId = initialTeamId ?? null;

  const app = express();
  app.use(express.json());

  app.get("/api/config", (_req, res) => {
    res.json(liveConfig ?? null);
  });

  app.post("/api/config", (req, res) => {
    try {
      const next = req.body;
      if (!next || typeof next !== "object") return res.status(400).json({ error: "Body inválido." });
      fs.writeFileSync(configPath, JSON.stringify(next, null, 2), "utf-8");
      liveConfig = next;
      liveTeamId = next._team_id ?? liveTeamId;
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/board", async (_req, res) => {
    if (!liveConfig || !liveTeamId) {
      return res.status(200).json({ columns: [], cardsByColumn: {}, unconfigured: true });
    }
    try {
      res.json(await fetchBoard(liveConfig, liveTeamId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/board/move", async (req, res) => {
    const { issueId } = req.body || {};
    if (!issueId) return res.status(400).json({ error: "issueId obrigatório." });
    if (!liveConfig?.in_progress) return res.status(400).json({ error: "in_progress não configurado." });

    try {
      const states = await linear.getWorkflowStates(liveConfig, liveTeamId);
      const target = states.find((s) => s.name.toLowerCase() === liveConfig.in_progress.toLowerCase());
      if (!target) return res.status(404).json({ error: `Estado "${liveConfig.in_progress}" não encontrado.` });

      const updated = await linear.updateIssueState(liveConfig, issueId, target.id);
      res.json({ ok: true, issue: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/status", async (_req, res) => {
    try {
      const [githubStatus, claudeStatus] = await Promise.all([
        getGithubStatus(),
        getClaudeStatus(),
      ]);
      res.json({ platform: process.platform, github: githubStatus, claude: claudeStatus });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use(express.static(WEB_DIST_DIR));
  app.use((_req, res) => res.sendFile(path.join(WEB_DIST_DIR, "index.html")));

  const host = "localhost";
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.on("error", (err) => {
      reject(err.code === "EADDRINUSE"
        ? new Error(`Porta ${port} já está em uso. Use --port para escolher outra.`)
        : err);
    });
  });

  return { app, server, url: `http://${host}:${port}` };
}
