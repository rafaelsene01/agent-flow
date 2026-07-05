import { getDb } from "../agent-runs/agent-runs.db.js";

// Registros de uso: um por execução de agente finalizada (inclusive resumes).
// Alimenta a tela "/usage" — separado da tabela agent_runs para sobreviver à
// limpeza da tela "/running" e ser limpo de forma independente.
let ensured = false;

function db() {
  const d = getDb();
  if (!ensured) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS usage_records (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name    TEXT NOT NULL,
        card_number   INTEGER,
        repo          TEXT NOT NULL,
        duration_ms   INTEGER NOT NULL DEFAULT 0,
        status        TEXT NOT NULL,
        input_tokens  INTEGER,
        output_tokens INTEGER,
        turns         INTEGER,
        cost_usd      REAL,
        created_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_records_created ON usage_records(created_at);
    `);
    ensured = true;
  }
  return d;
}

export function recordUsage({
  agentName,
  cardNumber,
  repo,
  durationMs,
  status,
  inputTokens,
  outputTokens,
  turns,
  costUsd,
}) {
  db()
    .prepare(
      `INSERT INTO usage_records (
        agent_name, card_number, repo, duration_ms, status,
        input_tokens, output_tokens, turns, cost_usd, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      agentName,
      cardNumber ?? null,
      repo,
      Math.round(durationMs ?? 0),
      status,
      inputTokens ?? null,
      outputTokens ?? null,
      turns ?? null,
      costUsd ?? null,
      new Date().toISOString(),
    );
}

// Lista registros filtrando por repo e/ou janela de dias (created_at >= agora - days).
export function listUsage({ repo, days } = {}) {
  const where = [];
  const params = [];
  if (repo) {
    where.push("repo = ?");
    params.push(repo);
  }
  if (days) {
    where.push("created_at >= ?");
    params.push(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
  }
  const sql =
    "SELECT * FROM usage_records" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY created_at DESC";
  return db().prepare(sql).all(...params);
}

export function clearUsage() {
  const { changes } = db().prepare(`DELETE FROM usage_records`).run();
  return changes;
}
