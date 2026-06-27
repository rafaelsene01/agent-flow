import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const REFRESH_INTERVAL_MS = 5 * 60_000;
const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");

let cachedData = null;
let pendingRefresh = null;

function getAccessToken() {
  const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  return creds.claudeAiOauth?.accessToken ?? null;
}

function formatReset(unixSecs, includeDate) {
  const date = new Date(unixSecs * 1000);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const opts = { hour: "numeric", minute: "2-digit", timeZone: tz };
  if (includeDate) { opts.month = "short"; opts.day = "numeric"; }
  return date.toLocaleString("en-US", opts);
}

async function fetchUsage() {
  const token = getAccessToken();
  if (!token) throw new Error("Token OAuth não encontrado em ~/.claude/.credentials.json");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    throw new Error(`API retornou ${res.status}: ${body.slice(0, 200)}`);
  }

  const h = res.headers;
  const sessionPct   = Math.round(parseFloat(h.get("anthropic-ratelimit-unified-5h-utilization") ?? "0") * 100);
  const sessionReset = parseInt(h.get("anthropic-ratelimit-unified-5h-reset") ?? "0", 10);
  const weeklyPct    = Math.round(parseFloat(h.get("anthropic-ratelimit-unified-7d-utilization") ?? "0") * 100);
  const weeklyReset  = parseInt(h.get("anthropic-ratelimit-unified-7d-reset") ?? "0", 10);

  if (!sessionReset && !weeklyReset) {
    console.warn("[usage] headers unified ausentes — headers presentes:", [...h.keys()].filter(k => k.startsWith("anthropic")).join(", ") || "(nenhum)");
    return null;
  }

  return {
    session: { pct: sessionPct, reset: formatReset(sessionReset, false) },
    weekly:  { pct: weeklyPct,  reset: formatReset(weeklyReset,  true)  },
  };
}

function refresh() {
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = fetchUsage()
    .then((data) => { if (data) cachedData = data; })
    .catch((err) => { console.error("[usage] refresh falhou:", err.message); })
    .finally(() => { pendingRefresh = null; });
  return pendingRefresh;
}

export default function usageRoutes(app) {
  refresh();
  setInterval(refresh, REFRESH_INTERVAL_MS);

  app.get("/api/usage", async (_req, res) => {
    if (!cachedData) await refresh();
    if (!cachedData) return res.status(503).json({ error: "Não foi possível obter dados de uso" });
    res.json(cachedData);
  });
}
