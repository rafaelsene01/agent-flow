import { randomUUID } from "crypto";
import { getDb } from "./agent-runs.db.js";

const PATCHABLE_COLUMNS = new Set([
  "agent_name",
  "worktree_path",
  "helpers_dir",
  "log_file",
  "status",
  "resume",
  "resume_message",
  "turns",
  "pending_question",
  "last_error",
  "started_at",
  "finished_at",
]);

export function createRun({
  id,
  chainId,
  agentId,
  agentName,
  repo,
  cardNumber,
  cardTitle,
  cardBody,
  originBranch,
  targetBranch,
  worktreePath,
  helpersDir,
  dependsOn,
  model,
  effort,
}) {
  const db = getDb();
  const runId = id || randomUUID();
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO agent_runs (
      id, session_id, agent_id, agent_name, repo, card_number, card_title, card_body,
      origin_branch, target_branch, worktree_path, helpers_dir, depends_on, chain_id,
      model, effort, status, resume, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
  ).run(
    runId,
    sessionId,
    agentId,
    agentName,
    repo,
    cardNumber ?? null,
    cardTitle ?? null,
    cardBody ?? null,
    originBranch,
    targetBranch,
    worktreePath ?? null,
    helpersDir ?? null,
    dependsOn ?? null,
    chainId ?? null,
    model || "sonnet",
    effort || "medium",
    now,
    now,
  );
  return getRun(runId);
}

// Todos os runs da mesma pipeline (chain), em ordem de criação. Se o run não
// pertencer a uma chain (chain_id nulo), devolve só ele.
export function getChain(id) {
  const run = getRun(id);
  if (!run) return [];
  if (!run.chain_id) return [run];
  return getDb()
    .prepare(`SELECT * FROM agent_runs WHERE chain_id = ? ORDER BY created_at ASC`)
    .all(run.chain_id);
}

export function listRuns() {
  return getDb().prepare(`SELECT * FROM agent_runs ORDER BY created_at DESC`).all();
}

// Runs de um card específico (repo + número), em ordem de criação.
export function listRunsForCard(repo, cardNumber) {
  return getDb()
    .prepare(`SELECT * FROM agent_runs WHERE repo = ? AND card_number = ? ORDER BY created_at ASC`)
    .all(repo, cardNumber);
}

// Resumo por card: quais têm run aguardando resposta (waiting-input) e/ou ativo
// (queued/processing). Usado para sinalizar no card do board.
export function runsAttentionSummary() {
  const rows = getDb()
    .prepare(
      `SELECT repo, card_number,
        SUM(CASE WHEN status = 'waiting-input' THEN 1 ELSE 0 END) AS waiting,
        SUM(CASE WHEN status IN ('queued','processing') THEN 1 ELSE 0 END) AS active
       FROM agent_runs
       WHERE card_number IS NOT NULL
       GROUP BY repo, card_number`,
    )
    .all();
  return rows.map((r) => ({
    repo: r.repo,
    cardNumber: r.card_number,
    waiting: r.waiting > 0,
    active: r.active > 0,
  }));
}

export function getRun(id) {
  return getDb().prepare(`SELECT * FROM agent_runs WHERE id = ?`).get(id) ?? null;
}

export function patchRun(id, patch) {
  const fields = Object.keys(patch).filter((f) => PATCHABLE_COLUMNS.has(f));
  if (!fields.length) return getRun(id);
  const now = new Date().toISOString();
  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => patch[f]);
  getDb()
    .prepare(`UPDATE agent_runs SET ${setClause}, updated_at = ? WHERE id = ?`)
    .run(...values, now, id);
  return getRun(id);
}

export function runsProcessingByAgent() {
  const rows = getDb()
    .prepare(`SELECT agent_id, COUNT(*) as n FROM agent_runs WHERE status = 'processing' GROUP BY agent_id`)
    .all();
  return new Map(rows.map((r) => [r.agent_id, r.n]));
}

// Runs prontos para despachar: status queued, agente livre e — se fizerem parte
// de uma pipeline (depends_on) — o passo anterior já concluído com `done`. Um run
// por agente livre por tick.
//
// Prioridade: runs que já começaram e estão retomando (resume=1 — resposta do
// usuário a uma pergunta, ou recovery de crash) vêm antes dos que ainda não
// começaram. Dentro de cada grupo, por ordem de criação. Assim, uma atividade
// que parou aguardando resposta retoma assim que o agente fica livre, na frente
// das que nunca iniciaram.
export function nextQueuedForFreeAgents(busyAgentIds) {
  const rows = getDb()
    .prepare(
      `SELECT r.* FROM agent_runs r
       WHERE r.status = 'queued'
         AND (
           r.depends_on IS NULL
           OR EXISTS (
             SELECT 1 FROM agent_runs d
             WHERE d.id = r.depends_on AND d.status = 'done'
           )
         )
       ORDER BY r.resume DESC, r.created_at ASC`,
    )
    .all();
  const claimed = new Set();
  const result = [];
  for (const row of rows) {
    if (busyAgentIds.has(row.agent_id) || claimed.has(row.agent_id)) continue;
    claimed.add(row.agent_id);
    result.push(row);
  }
  return result;
}

// Falha em cascata os runs que dependem (direta ou transitivamente) de um run que
// terminou em erro — eles nunca poderão rodar, pois exigem o passo anterior `done`.
export function failDependents(runId, reason) {
  const deps = getDb()
    .prepare(`SELECT id FROM agent_runs WHERE depends_on = ? AND status = 'queued'`)
    .all(runId);
  for (const d of deps) {
    patchRun(d.id, { status: "error", last_error: reason });
    failDependents(d.id, reason);
  }
}

// ── Turns (timeline "chat" de uma execução) ─────────────────────────────────────
// Cada run guarda um array JSON de turns na coluna `turns`:
//   { type: 'exec',     logFile, status, startedAt, finishedAt }  — um segmento de execução
//   { type: 'question', text, options: [] }                        — pergunta do agente
//   { type: 'answer',   text }                                     — resposta do usuário

function parseTurns(run) {
  if (!run?.turns) return [];
  try {
    const t = JSON.parse(run.turns);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

export function appendTurn(id, turn) {
  const turns = parseTurns(getRun(id));
  turns.push({ ...turn, at: turn.at ?? new Date().toISOString() });
  patchRun(id, { turns: JSON.stringify(turns) });
  return turns;
}

// Atualiza (merge) o último turn de execução — usado para marcar seu status final.
export function updateLastExecTurn(id, patch) {
  const turns = parseTurns(getRun(id));
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].type === "exec") {
      turns[i] = { ...turns[i], ...patch };
      patchRun(id, { turns: JSON.stringify(turns) });
      return;
    }
  }
}

export function resetProcessingToQueued() {
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE agent_runs SET status = 'queued', resume = 1, updated_at = ? WHERE status = 'processing'`)
    .run(now);
}
