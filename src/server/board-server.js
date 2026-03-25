import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// web/dist is pre-built and shipped inside the npm package.
// Path: <package-root>/web/dist  (this file is at <package-root>/src/server/)
const WEB_DIST_DIR = path.resolve(__dirname, "../../web/dist");

const LINEAR_GQL = "https://api.linear.app/graphql";

// ── Linear helpers ────────────────────────────────────────────────────────────

async function linearQuery(apiKey, gql, variables = {}) {
  const res = await fetch(LINEAR_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query: gql, variables }),
  });
  if (!res.ok) throw new Error(`Linear HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

async function linearViewer(apiKey) {
  const d = await linearQuery(apiKey, `{ viewer { id name email } }`);
  return d.viewer;
}
async function linearTeams(apiKey) {
  const d = await linearQuery(apiKey, `{ teams { nodes { id name key } } }`);
  return d.teams.nodes;
}
async function linearStates(apiKey, teamId) {
  const d = await linearQuery(apiKey,
    `query($t: ID!) { workflowStates(filter:{team:{id:{eq:$t}}}){ nodes{id name type position} } }`,
    { t: teamId }
  );
  return d.workflowStates.nodes.sort((a, b) => a.position - b.position);
}
async function linearLabels(apiKey, teamId) {
  const d = await linearQuery(apiKey,
    `query($t: ID!) { issueLabels(filter:{team:{id:{eq:$t}}}){ nodes{id name color} } }`,
    { t: teamId }
  );
  return d.issueLabels.nodes;
}

// ── server ────────────────────────────────────────────────────────────────────

export async function startBoardServer({ config: initialConfig, teamId: initialTeamId, fetchBoard, port, configPath }) {
  if (!fs.existsSync(WEB_DIST_DIR)) {
    throw new Error(
      `Frontend não encontrado em ${WEB_DIST_DIR}\n` +
      `  Execute "npm run build:web" dentro do repositório antes de usar.`
    );
  }

  // mutable live state — updated when /api/config is POSTed
  let liveConfig = initialConfig ? { ...initialConfig } : null;
  let liveTeamId = initialTeamId ?? null;

  const app = express();
  app.use(express.json());

  // ── /api/config ─────────────────────────────────────────────────────────────
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

  // ── /api/board ───────────────────────────────────────────────────────────────
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

  // ── /api/linear/* ────────────────────────────────────────────────────────────
  app.post("/api/linear/validate", async (req, res) => {
    const { api_key } = req.body || {};
    if (!api_key) return res.status(400).json({ error: "api_key obrigatório." });
    try {
      const viewer = await linearViewer(api_key);
      res.json({ ok: true, name: viewer.name, email: viewer.email });
    } catch {
      res.status(401).json({ ok: false, error: "API key inválida." });
    }
  });

  app.get("/api/linear/teams", async (req, res) => {
    const { api_key } = req.query;
    if (!api_key) return res.status(400).json({ error: "api_key obrigatório." });
    try { res.json(await linearTeams(api_key)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/linear/states", async (req, res) => {
    const { api_key, team_id } = req.query;
    if (!api_key || !team_id) return res.status(400).json({ error: "api_key e team_id obrigatórios." });
    try { res.json(await linearStates(api_key, team_id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/linear/labels", async (req, res) => {
    const { api_key, team_id } = req.query;
    if (!api_key || !team_id) return res.status(400).json({ error: "api_key e team_id obrigatórios." });
    try { res.json(await linearLabels(api_key, team_id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── static + SPA ─────────────────────────────────────────────────────────────
  app.use(express.static(WEB_DIST_DIR));
  app.use((_req, res) => res.sendFile(path.join(WEB_DIST_DIR, "index.html")));

  // ── listen ────────────────────────────────────────────────────────────────────
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
