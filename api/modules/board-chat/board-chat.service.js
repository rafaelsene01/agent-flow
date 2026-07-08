import fs from "fs";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { getDb } from "../agent-runs/agent-runs.db.js";
import { runClaude, resumeClaude, failureDetail } from "../claude/claude.runner.js";
import { extractFinalText } from "../skills/skill-creator.js";
import { setupChatWorktree } from "../git/git.worktree.js";
import { get as getRepoProvider } from "../repos/repos.registry.js";
import { getLanguage, getWorktrees, removeWorktree } from "../config/config.service.js";

const execFileP = promisify(execFile);

// Como no skill-creator: a conversa não tem log persistido por worktree — o
// resultado de cada turno volta na própria resposta HTTP.
const NOOP_LOG = { write() {}, persistPath: null };

// Um chat por board (board_id é a PK). O thread inteiro fica em JSON na linha,
// para o "continuar chat" restaurar a conversa no modal.
let tableReady = false;
function db() {
  const d = getDb();
  if (!tableReady) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS board_chats (
        board_id      TEXT PRIMARY KEY,
        session_id    TEXT NOT NULL,
        repo          TEXT NOT NULL,
        branch        TEXT NOT NULL,
        model         TEXT NOT NULL DEFAULT 'sonnet',
        effort        TEXT NOT NULL DEFAULT 'medium',
        worktree_path TEXT,
        thread        TEXT NOT NULL DEFAULT '[]',
        status        TEXT NOT NULL DEFAULT 'idle',
        error         TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
    `);
    // Migração para tabelas antigas (ALTER falha se a coluna já existir).
    try { d.exec(`ALTER TABLE board_chats ADD COLUMN status TEXT NOT NULL DEFAULT 'idle'`); } catch { /* já existe */ }
    try { d.exec(`ALTER TABLE board_chats ADD COLUMN error TEXT`); } catch { /* já existe */ }
    // Turno interrompido por reinício do servidor: não pode ficar 'running' para
    // sempre (bloquearia novos envios). Marca como erro na primeira carga.
    d.prepare(`
      UPDATE board_chats SET status = 'error', error = 'Turno interrompido (servidor reiniciado).'
      WHERE status = 'running'
    `).run();
    tableReady = true;
  }
  return d;
}

function rowToChat(row) {
  if (!row) return null;
  let thread = [];
  try { thread = JSON.parse(row.thread); } catch { /* thread corrompido — recomeça vazio */ }
  return {
    boardId: row.board_id,
    repo: row.repo,
    branch: row.branch,
    model: row.model,
    effort: row.effort,
    worktreePath: row.worktree_path,
    thread,
    status: row.status ?? "idle",
    error: row.error ?? null,
    updatedAt: row.updated_at,
  };
}

export function getChat(boardId) {
  const row = db().prepare(`SELECT * FROM board_chats WHERE board_id = ?`).get(boardId);
  return rowToChat(row);
}

// Remove a worktree do chat (registro no config + diretórios), no mesmo padrão do
// DELETE /api/config/worktrees/:id.
async function removeChatWorktree(boardId, repo, worktreePath) {
  const wtId = `${repo}#chat-${boardId}`;
  const wt = getWorktrees().find((w) => w.id === wtId);
  const path = wt?.path ?? worktreePath;
  if (wt?.repoDir && fs.existsSync(wt.repoDir) && path) {
    await execFileP("git", ["worktree", "remove", "--force", path], {
      cwd: wt.repoDir, timeout: 15_000,
    }).catch(() => {});
    await execFileP("git", ["worktree", "prune"], {
      cwd: wt.repoDir, timeout: 10_000,
    }).catch(() => {});
  }
  if (path && fs.existsSync(path)) {
    fs.rmSync(path, { recursive: true, force: true });
  }
  const helpersDir = wt?.helpersDir ?? (path ? path + "-helpers" : null);
  if (helpersDir && fs.existsSync(helpersDir)) {
    fs.rmSync(helpersDir, { recursive: true, force: true });
  }
  if (wt) removeWorktree(wtId);
}

// Apaga o registro do chat e a worktree associada (usado ao iniciar um novo chat).
export async function deleteChat(boardId) {
  const chat = getChat(boardId);
  if (chat) await removeChatWorktree(boardId, chat.repo, chat.worktreePath);
  db().prepare(`DELETE FROM board_chats WHERE board_id = ?`).run(boardId);
}

function langLine() {
  return getLanguage() === "pt"
    ? "Converse em português do Brasil."
    : "Converse in English.";
}

function buildPreamble(repo, branch) {
  return [
    `Você é um assistente de chat rodando dentro de uma worktree do repositório ${repo}, com a branch ${branch} em checkout.`,
    "Use os arquivos do projeto (diretório atual) como referência para responder perguntas sobre o código.",
    "Responda de forma direta e objetiva, em markdown.",
    langLine(),
  ].join("\n");
}

async function runTurn({ first, prompt, cwd, sessionId, model, effort }) {
  const opts = { model: model || "sonnet", effort: effort || "medium" };
  const result = first
    ? await runClaude(prompt, cwd, NOOP_LOG, null, null, { ...opts, sessionId })
    : await resumeClaude(prompt, cwd, NOOP_LOG, sessionId, null, opts);
  if (result.code !== 0) {
    throw new Error(`Claude falhou: ${failureDetail(result, null)}`);
  }
  const text = extractFinalText(result.output).trim();
  return text || "(sem resposta)";
}

// Inicia um chat novo: apaga qualquer chat/worktree anterior do board, registra
// o chat como 'running' ANTES do turno (fechar e reabrir o modal mostra a
// conversa em processamento), cria a worktree e roda o primeiro turno dentro dela.
export async function startChat({ boardId, repo, branch, model, effort, prompt }) {
  const [owner, repoName] = String(repo).split("/");
  if (!owner || !repoName) throw new Error("Repositório inválido (esperado owner/nome).");

  const existing = getChat(boardId);
  if (existing?.status === "running")
    throw new Error("O chat deste board ainda está processando uma resposta. Aguarde terminar.");

  await deleteChat(boardId);

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const thread = [{ role: "user", text: prompt.trim() }];
  db().prepare(`
    INSERT INTO board_chats (board_id, session_id, repo, branch, model, effort, worktree_path, thread, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)
  `).run(boardId, sessionId, repo, branch, model || "sonnet", effort || "medium", null, JSON.stringify(thread), now, now);

  try {
    const cloneUrl = getRepoProvider("github").getCloneUrl({ owner, repo: repoName });
    const { worktreeDir } = await setupChatWorktree({ host: "github", owner, repo: repoName, cloneUrl, branch, boardId });
    db().prepare(`UPDATE board_chats SET worktree_path = ? WHERE board_id = ?`).run(worktreeDir, boardId);

    const fullPrompt = buildPreamble(repo, branch) + "\n\nMensagem do usuário:\n" + prompt.trim();
    const text = await runTurn({ first: true, prompt: fullPrompt, cwd: worktreeDir, sessionId, model, effort });

    thread.push({ role: "assistant", text });
    db().prepare(`
      UPDATE board_chats SET thread = ?, status = 'idle', error = NULL, updated_at = ? WHERE board_id = ?
    `).run(JSON.stringify(thread), new Date().toISOString(), boardId);

    return { text };
  } catch (err) {
    db().prepare(`
      UPDATE board_chats SET status = 'error', error = ?, updated_at = ? WHERE board_id = ?
    `).run(err.message, new Date().toISOString(), boardId);
    throw err;
  }
}

// Turno seguinte de um chat existente: retoma a sessão dentro da worktree.
// A mensagem do usuário é gravada com status 'running' ANTES do turno; no erro o
// thread volta ao estado anterior (o modal restaura o rascunho para reenviar).
export async function sendMessage({ boardId, prompt, model, effort }) {
  const row = db().prepare(`SELECT * FROM board_chats WHERE board_id = ?`).get(boardId);
  if (!row) throw new Error("Nenhum chat encontrado para este board. Inicie um novo chat.");
  if (row.status === "running")
    throw new Error("O chat ainda está processando a resposta anterior. Aguarde terminar.");
  if (!row.worktree_path || !fs.existsSync(row.worktree_path)) {
    throw new Error("A worktree deste chat não existe mais. Inicie um novo chat.");
  }

  let thread = [];
  try { thread = JSON.parse(row.thread); } catch { /* recomeça o histórico */ }
  const pendingThread = [...thread, { role: "user", text: prompt.trim() }];
  db().prepare(`
    UPDATE board_chats SET thread = ?, status = 'running', error = NULL, model = ?, effort = ?, updated_at = ? WHERE board_id = ?
  `).run(JSON.stringify(pendingThread), model || row.model, effort || row.effort, new Date().toISOString(), boardId);

  try {
    const text = await runTurn({
      first: false,
      prompt: prompt.trim(),
      cwd: row.worktree_path,
      sessionId: row.session_id,
      model: model || row.model,
      effort: effort || row.effort,
    });

    pendingThread.push({ role: "assistant", text });
    db().prepare(`
      UPDATE board_chats SET thread = ?, status = 'idle', updated_at = ? WHERE board_id = ?
    `).run(JSON.stringify(pendingThread), new Date().toISOString(), boardId);

    return { text };
  } catch (err) {
    db().prepare(`
      UPDATE board_chats SET thread = ?, status = 'error', error = ?, updated_at = ? WHERE board_id = ?
    `).run(JSON.stringify(thread), err.message, new Date().toISOString(), boardId);
    throw err;
  }
}
