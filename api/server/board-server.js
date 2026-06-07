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

function mapIssues(issues) {
  return issues.map((i) => ({
    id:              i.id,
    identifier:      i.identifier,
    rawTitle:        i.title,
    title:           i.title,
    priority:        i.priority,
    url:             i.url,
    dueDate:         i.dueDate || null,
    completedAt:     i.completedAt || null,
    description:     i.description || "",
    assigneeDisplay: i.assignee?.displayName || i.assignee?.name || null,
    rawLabels:       i.labels?.nodes || [],
  }));
}

async function fetchBoard(config, teamId) {
  const boardConfig = {
    ...config,
    pick_from: config.board_columns?.length ? config.board_columns : config.pick_from,
  };

  const [allStates, issues] = await Promise.all([
    linear.getWorkflowStates(config, teamId),
    linear.getIssues(boardConfig, teamId),
  ]);

  const selectedNames = config.board_columns?.length
    ? new Set(config.board_columns.map((n) => n.toLowerCase()))
    : null;

  let columns = selectedNames
    ? allStates.filter((s) => selectedNames.has(s.name.toLowerCase()))
    : [...allStates];

  if (config.done) {
    const doneName = config.done.toLowerCase();
    const idx = columns.findIndex((s) => s.name.toLowerCase() === doneName);
    if (idx >= 0 && idx !== columns.length - 1) {
      columns.push(columns.splice(idx, 1)[0]);
    }
  }

  const doneDays = Number(config.done_days ?? 0);
  const doneColName = (config.done || "").toLowerCase();
  const cutoff = doneDays > 0
    ? new Date(Date.now() - doneDays * 24 * 60 * 60 * 1000)
    : null;

  const cardsByColumn = {};
  for (const state of columns) {
    let cards = mapIssues(issues.filter((i) => i.state.id === state.id));

    if (cutoff && doneColName && state.name.toLowerCase() === doneColName) {
      cards = cards.filter((c) => {
        if (!c.completedAt) return false;
        return new Date(c.completedAt) >= cutoff;
      });
    }

    cardsByColumn[state.id] = cards;
  }

  return { columns, cardsByColumn };
}

async function getGithubStatus() {
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;
  console.log("[github] envToken present:", !!envToken);
  if (envToken) {
    try {
      const user = await github.validateToken(envToken);
      console.log("[github] env token ok:", user.login);
      return { connected: true, method: "env", user: user.login, name: user.name };
    } catch (err) {
      console.log("[github] env token failed:", err.message);
    }
  }

  let ghInstalled = false;
  try {
    execSync("gh --version", { stdio: "pipe", timeout: 3000 });
    ghInstalled = true;
  } catch {}
  console.log("[github] gh installed:", ghInstalled);

  if (ghInstalled) {
    try {
      const out = execSync("gh api user", { stdio: "pipe", encoding: "utf-8", timeout: 8000 });
      const user = JSON.parse(out);
      console.log("[github] gh-cli ok:", user.login);
      return { connected: true, method: "gh-cli", user: user.login, name: user.name };
    } catch (err) {
      // gh pode falhar por pegar o mesmo token inválido do ambiente — continua para SSH
      console.log("[github] gh-cli failed:", err.message);
    }
  }

  console.log("[github] trying ssh...");
  try {
    const out = execSync(
      "ssh -T -o StrictHostKeyChecking=no git@github.com",
      { stdio: "pipe", encoding: "utf-8", timeout: 10000, shell: true }
    );
    console.log("[github] ssh stdout:", JSON.stringify(out));
    const match = (out || "").match(/Hi (.+?)!/);
    if (match) return { connected: true, method: "ssh", user: match[1] };
  } catch (err) {
    const combined = (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
    console.log("[github] ssh threw, combined:", JSON.stringify(combined));
    const match = combined.match(/Hi (.+?)!/);
    if (match) return { connected: true, method: "ssh", user: match[1] };
  }

  console.log("[github] trying git ls-remote...");
  try {
    execSync(
      "git ls-remote git@github.com:github/gitignore.git HEAD",
      { stdio: "pipe", timeout: 10000, shell: true }
    );
    console.log("[github] git ls-remote ok");
    return { connected: true, method: "ssh" };
  } catch (err) {
    console.log("[github] git ls-remote failed:", err.stderr?.toString()?.trim());
  }

  console.log("[github] all methods failed");
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

export async function startBoardServer({ config: initialConfig, teamId: initialTeamId, port, configPath }) {
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
