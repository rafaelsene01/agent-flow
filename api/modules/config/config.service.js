import fs from "fs";
import os from "os";
import path from "path";

const APP_DIR     = path.join(os.homedir(), ".agent-flow");
const CONFIG_FILE = path.join(APP_DIR, "config.json");

const DEFAULTS = {
  projectsPath:      path.join(APP_DIR, "projects"),
  boards:            [],
  maxConcurrentRuns: 3,
  runTimeoutMinutes: 30,
  language:          "en",
};

function ensureDirs() {
  fs.mkdirSync(path.join(APP_DIR, "projects"), { recursive: true });
}

ensureDirs();

function _readSync() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

// All writes go through this chain to prevent concurrent read→write races.
let writeChain = Promise.resolve();

function enqueueWrite(fn) {
  const p = writeChain.then(() => {
    ensureDirs();
    const current = _readSync();
    const next = fn(current);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf-8");
    return next;
  });
  // Keep the chain alive even if one write fails.
  writeChain = p.catch(() => {});
  return p;
}

// Back-compat de provider (REQ-9): aplica defaults na LEITURA, sem migrar o disco.
// board sem `source` ⇒ "github-board"; `repos` normalizado para array (derivação
// lazy a partir do source acontece na camada de rotas, não aqui).
export function normalizeBoard(board) {
  return {
    ...board,
    source: board.source ?? "github-board",
    repos:  Array.isArray(board.repos) ? board.repos : [],
  };
}

export function getConfig() {
  ensureDirs();
  const cfg = _readSync();
  return { ...cfg, boards: (cfg.boards ?? []).map(normalizeBoard) };
}

export function getLanguage() {
  return _readSync().language ?? "en";
}

export function setConfig(updates) {
  return enqueueWrite((current) => ({ ...current, ...updates }));
}

// ── Worktrees ──────────────────────────────────────────────────────────────────

export function getWorktrees() {
  // Entradas antigas não têm `host` — default "github" na leitura (REQ-9).
  return (getConfig().worktrees ?? []).map((w) => ({ host: "github", ...w }));
}

export function registerWorktree({ host = "github", owner, repo, branch, originBranch, cardNumber, repoDir, worktreeDir }) {
  // Prefixa o host só quando ≠ github, mantendo ids github existentes estáveis
  // (sem churn de dados). github ⇒ owner/repo#card; outro ⇒ host:owner/repo#card.
  const slug       = `${owner}/${repo}#${cardNumber}`;
  const id         = host && host !== "github" ? `${host}:${slug}` : slug;
  const helpersDir = worktreeDir + "-helpers";
  fs.mkdirSync(helpersDir, { recursive: true });
  const entry = {
    id,
    host,
    cardNumber,
    repo: `${owner}/${repo}`,
    branch,
    originBranch: originBranch ?? null,
    path:      worktreeDir,
    helpersDir,
    repoDir,
    createdAt: new Date().toISOString(),
  };
  enqueueWrite((current) => {
    const existing = (current.worktrees ?? []).filter((w) => w.id !== id);
    return { ...current, worktrees: [...existing, entry] };
  });
  return entry;
}

export function getHelpersDir(wt) {
  const dir = wt.helpersDir ?? (wt.path + "-helpers");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getOverlayDir(originRepo) {
  const parts = String(originRepo).split("/");
  const dir = parts.length >= 2
    ? path.join(APP_DIR, "overlays", parts[0], parts[1])
    : path.join(APP_DIR, "overlays", originRepo);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function removeWorktree(id) {
  return enqueueWrite((current) => ({
    ...current,
    worktrees: (current.worktrees ?? []).filter((w) => w.id !== id),
  }));
}

export function updateWorktreeStatus(id, updates) {
  return enqueueWrite((current) => ({
    ...current,
    worktrees: (current.worktrees ?? []).map((w) => w.id === id ? { ...w, ...updates } : w),
  }));
}

export function appendChatSession(id, entry) {
  return enqueueWrite((current) => ({
    ...current,
    worktrees: (current.worktrees ?? []).map((w) =>
      w.id === id
        ? { ...w, chatSessions: [...(w.chatSessions ?? []), entry] }
        : w,
    ),
  }));
}

export function updateChatSession(id, sessionId, patch) {
  return enqueueWrite((current) => ({
    ...current,
    worktrees: (current.worktrees ?? []).map((w) =>
      w.id === id
        ? {
            ...w,
            chatSessions: (w.chatSessions ?? []).map((s) =>
              s.id === sessionId ? { ...s, ...patch } : s,
            ),
          }
        : w,
    ),
  }));
}
