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
  kind,
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
  // Ponto de parada não roda no Claude: é uma linha na chain que só destrava o
  // próximo passo quando o usuário a aprova. Usa sentinelas nas colunas NOT NULL.
  const isBreakpoint = kind === "breakpoint";
  db.prepare(
    `INSERT INTO agent_runs (
      id, session_id, kind, agent_id, agent_name, repo, card_number, card_title, card_body,
      origin_branch, target_branch, worktree_path, helpers_dir, depends_on, chain_id,
      model, effort, status, resume, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
  ).run(
    runId,
    sessionId,
    isBreakpoint ? "breakpoint" : "agent",
    isBreakpoint ? "__breakpoint__" : agentId,
    isBreakpoint ? "Ponto de parada" : agentName,
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
        SUM(CASE WHEN status IN ('waiting-input','waiting-approval') THEN 1 ELSE 0 END) AS waiting,
        SUM(CASE WHEN status IN ('queued','processing','waiting-approval') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
        COUNT(*) AS total
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
    error: r.errors > 0,
    allDone: r.total > 0 && r.done === r.total,
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

// Chave canônica de uma worktree (repo + branch). ÚNICO ponto que monta a chave:
// scheduler e locks comparam esses valores entre si — formatos divergentes fazem o
// lock nunca casar e runs despacharem fora de ordem.
export function worktreeKey(repo, targetBranch) {
  return `${repo} ${targetBranch}`;
}

// Chaves das worktrees ocupadas por um run não-terminal: processando ou pausado
// aguardando input/aprovação. Uma worktree ocupada não pode receber outro
// run — dois agentes na mesma árvore de trabalho corromperiam o git working tree.
// Assim, levas de agentes adicionadas a um card entram na fila e só rodam quando a
// anterior libera a worktree, em vez de disparar em paralelo.
export function worktreesOccupied() {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT repo, target_branch FROM agent_runs
       WHERE status IN ('processing', 'waiting-input', 'waiting-approval')`,
    )
    .all();
  return new Set(rows.map((r) => worktreeKey(r.repo, r.target_branch)));
}

// Runs prontos para despachar: status queued, agente livre, worktree livre e — se
// fizerem parte de uma pipeline (depends_on) — o passo anterior já concluído com
// `done`. Um run por agente livre e um run por worktree por tick.
//
// Prioridade: runs que já começaram e estão retomando (resume=1 — resposta do
// usuário a uma pergunta, ou recovery de crash) vêm antes dos que ainda não
// começaram. Dentro de cada grupo, por ordem de criação. Assim, uma atividade
// que parou aguardando resposta retoma assim que o agente fica livre, na frente
// das que nunca iniciaram.
//
// FIFO estrito por agente e por worktree: um run bloqueado (agente ocupado ou
// worktree ocupada) reserva ambos os recursos — runs mais novos do mesmo agente
// ou da mesma worktree NÃO furam a fila. O paralelismo acontece só entre agentes
// e worktrees sem pendência anterior na fila.
//
// `busyWorktreeKeys`: worktrees já ocupadas (chave repo+branch). Serializa levas de
// agentes na mesma worktree — a segunda leva espera a primeira liberar a árvore.
export function nextQueuedForFreeAgents(busyAgentIds, busyWorktreeKeys = new Set()) {
  const rows = getDb()
    .prepare(
      `SELECT r.* FROM agent_runs r
       WHERE r.status = 'queued'
         AND r.kind = 'agent'
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
  const claimedWt = new Set();
  const result = [];
  for (const row of rows) {
    const wtk = worktreeKey(row.repo, row.target_branch);
    const blocked =
      busyAgentIds.has(row.agent_id) ||
      claimed.has(row.agent_id) ||
      busyWorktreeKeys.has(wtk) ||
      claimedWt.has(wtk);
    // Reserva agente e worktree mesmo quando bloqueado: mantém a ordem da fila —
    // um run mais novo do mesmo agente/worktree espera este despachar primeiro.
    claimed.add(row.agent_id);
    claimedWt.add(wtk);
    if (!blocked) result.push(row);
  }
  return result;
}

// Pontos de parada (kind='breakpoint') cuja dependência já concluiu `done` e que
// ainda estão na fila: passam para `waiting-approval`, aguardando o usuário. Não
// são despachados ao Claude — só destravam o próximo passo quando aprovados.
export function promoteReadyBreakpoints() {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      `UPDATE agent_runs SET status = 'waiting-approval', updated_at = ?
       WHERE kind = 'breakpoint' AND status = 'queued'
         AND (
           depends_on IS NULL
           OR EXISTS (SELECT 1 FROM agent_runs d WHERE d.id = agent_runs.depends_on AND d.status = 'done')
         )`,
    )
    .run(now);
  return info.changes > 0;
}

// Aprova um ponto de parada aguardando: marca `done` para destravar o próximo
// passo. Retorna false se o run não for um breakpoint aguardando aprovação.
export function approveBreakpoint(id) {
  const run = getRun(id);
  if (!run || run.kind !== "breakpoint" || run.status !== "waiting-approval") return false;
  patchRun(id, { status: "done", finished_at: new Date().toISOString() });
  return true;
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
//   { type: 'result',   text }                                     — resposta final do agente (markdown)

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

// Remove um run do banco. Usado só pela tela "/running" (limpeza manual).
export function deleteRun(id) {
  const info = getDb().prepare(`DELETE FROM agent_runs WHERE id = ?`).run(id);
  return info.changes > 0;
}

// Apaga todos os runs do banco. Retorna a quantidade removida.
export function clearRuns() {
  const info = getDb().prepare(`DELETE FROM agent_runs`).run();
  return info.changes;
}

export function resetProcessingToQueued() {
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE agent_runs SET status = 'queued', resume = 1, updated_at = ? WHERE status = 'processing'`)
    .run(now);
}
