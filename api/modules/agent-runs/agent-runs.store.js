import { randomUUID } from "crypto";
import { getDb } from "./agent-runs.db.js";
import { notifyRunEvent } from "../integrations/telegram.service.js";

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
  sessionId,
  sessionIndex,
}) {
  const db = getDb();
  const runId = id || randomUUID();
  const now = new Date().toISOString();
  // Ponto de parada não roda no Claude: é uma linha na chain que só destrava o
  // próximo passo quando o usuário a aprova. Usa sentinelas nas colunas NOT NULL.
  const isBreakpoint = kind === "breakpoint";
  // Sessão compartilhada: `sessionId` vindo de fora reusa a sessão de outro run
  // (o runner detecta e faz resume em vez de criar). `sessionIndex` é o número
  // exibido na UI — sem um explícito, runs de card ganham o próximo índice livre.
  const sid = sessionId || randomUUID();
  const sidx = isBreakpoint
    ? null
    : sessionIndex ?? (cardNumber != null ? nextSessionIndexForCard(repo, cardNumber) : null);
  db.prepare(
    `INSERT INTO agent_runs (
      id, session_id, kind, agent_id, agent_name, repo, card_number, card_title, card_body,
      origin_branch, target_branch, worktree_path, helpers_dir, depends_on, chain_id,
      model, effort, session_index, status, resume, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
  ).run(
    runId,
    sid,
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
    sidx,
    now,
    now,
  );
  return getRun(runId);
}

// Próximo índice de sessão livre do card (1-based). O índice numera as sessões
// do Claude usadas pelos runs do card — passos com o mesmo índice compartilham
// a sessão (resume) em vez de criar uma nova.
export function nextSessionIndexForCard(repo, cardNumber) {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(MAX(session_index), 0) + 1 AS next
       FROM agent_runs WHERE repo = ? AND card_number = ?`,
    )
    .get(repo, cardNumber);
  return row.next;
}

// Mapa índice → session_id das sessões já usadas pelos runs do card (o run mais
// recente de cada índice vence — todos compartilham o mesmo session_id de toda
// forma). Usado pela rota de chain para resolver `sessionIndex` em `sessionId`.
export function sessionsByIndexForCard(repo, cardNumber) {
  const rows = getDb()
    .prepare(
      `SELECT session_index, session_id FROM agent_runs
       WHERE repo = ? AND card_number = ? AND session_index IS NOT NULL
       ORDER BY created_at ASC`,
    )
    .all(repo, cardNumber);
  return new Map(rows.map((r) => [r.session_index, r.session_id]));
}

// Outro run desta sessão já chegou a executar? Se sim, a primeira execução deste
// run deve RETOMAR a sessão (resume) em vez de criá-la com --session-id — criar
// de novo falharia (sessão duplicada) e perderia o contexto acumulado.
export function sessionHasStartedRun(sessionId, excludeRunId) {
  return !!getDb()
    .prepare(
      `SELECT 1 FROM agent_runs
       WHERE session_id = ? AND id != ? AND started_at IS NOT NULL LIMIT 1`,
    )
    .get(sessionId, excludeRunId);
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

// `silent: true` suprime a notificação de integração (usado por failDependents —
// falhas em cascata não notificam, só o erro raiz).
export function patchRun(id, patch, { silent = false } = {}) {
  const fields = Object.keys(patch).filter((f) => PATCHABLE_COLUMNS.has(f));
  if (!fields.length) return getRun(id);
  const prevStatus = patch.status !== undefined ? getRun(id)?.status : undefined;
  const now = new Date().toISOString();
  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => patch[f]);
  getDb()
    .prepare(`UPDATE agent_runs SET ${setClause}, updated_at = ? WHERE id = ?`)
    .run(...values, now, id);
  const run = getRun(id);
  if (!silent && patch.status !== undefined && run && run.status !== prevStatus) {
    notifyStatusChange(run);
  }
  return run;
}

// Dispara a notificação de integração (Telegram) na transição de status:
// erro raiz, aguardando entrada/aprovação, ou card 100% concluído.
function notifyStatusChange(run) {
  if (run.status === "error") {
    notifyRunEvent(run, "error");
  } else if (run.status === "waiting-input" || run.status === "waiting-approval") {
    notifyRunEvent(run, "waiting");
  } else if (run.status === "done") {
    // Escopo do "tudo finalizado" é o card inteiro: levas enfileiradas em
    // momentos diferentes têm chain_id distintos — checar só a chain deste run
    // dispararia uma mensagem por leva. Run sem card usa a própria chain.
    const runs =
      run.card_number != null ? listRunsForCard(run.repo, run.card_number) : getChain(run.id);
    if (runs.length && runs.every((r) => r.status === "done")) {
      notifyRunEvent(run, "chain-done");
    }
  }
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
  const db = getDb();
  // Seleciona antes do UPDATE em massa para notificar cada breakpoint promovido
  // (o UPDATE direto não passa pelo patchRun, onde vive o hook de notificação).
  const ready = db
    .prepare(
      `SELECT * FROM agent_runs
       WHERE kind = 'breakpoint' AND status = 'queued'
         AND (
           depends_on IS NULL
           OR EXISTS (SELECT 1 FROM agent_runs d WHERE d.id = agent_runs.depends_on AND d.status = 'done')
         )`,
    )
    .all();
  if (!ready.length) return false;
  const now = new Date().toISOString();
  const stmt = db.prepare(`UPDATE agent_runs SET status = 'waiting-approval', updated_at = ? WHERE id = ?`);
  for (const run of ready) {
    stmt.run(now, run.id);
    notifyRunEvent({ ...run, status: "waiting-approval" }, "waiting");
  }
  return true;
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
    patchRun(d.id, { status: "error", last_error: reason }, { silent: true });
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
// Antes de apagar, re-vincula os passos que dependiam deste ao ANTECESSOR dele
// (o próprio `depends_on` do removido): remover o passo 3 de uma chain 1→2→3→4
// faz o 4 passar a depender do 2. Sem isso, o 4 ficaria com `depends_on`
// apontando para um run inexistente e nunca despacharia (o EXISTS de
// nextQueuedForFreeAgents daria falso para sempre).
export function deleteRun(id) {
  const db = getDb();
  const run = getRun(id);
  if (!run) return false;
  const now = new Date().toISOString();
  db.prepare(`UPDATE agent_runs SET depends_on = ?, updated_at = ? WHERE depends_on = ?`)
    .run(run.depends_on ?? null, now, id);
  const info = db.prepare(`DELETE FROM agent_runs WHERE id = ?`).run(id);
  return info.changes > 0;
}

// Rede de segurança: re-vincula runs cujo `depends_on` aponta para um run que não
// existe mais (chains que ficaram órfãs antes do re-link em deleteRun). Reconstrói
// o link pela ordem da chain — aponta o órfão para o passo existente imediatamente
// anterior (mesma chain, criado antes); se não houver, vira primeiro passo (null).
// Chamada no boot (recoverAndDispatch) para destravar pipelines já quebradas.
export function healOrphanDependencies() {
  const db = getDb();
  const orphans = db
    .prepare(
      `SELECT * FROM agent_runs r
       WHERE r.depends_on IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM agent_runs d WHERE d.id = r.depends_on)`,
    )
    .all();
  if (!orphans.length) return false;
  const now = new Date().toISOString();
  const findPrev = db.prepare(
    `SELECT id FROM agent_runs
     WHERE chain_id = ? AND id != ? AND created_at < ?
     ORDER BY created_at DESC LIMIT 1`,
  );
  const upd = db.prepare(`UPDATE agent_runs SET depends_on = ?, updated_at = ? WHERE id = ?`);
  for (const o of orphans) {
    const prev = o.chain_id ? findPrev.get(o.chain_id, o.id, o.created_at) : null;
    upd.run(prev?.id ?? null, now, o.id);
  }
  return true;
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
