import fs from "fs";
import os from "os";
import path from "path";

const APP_DIR     = path.join(os.homedir(), ".agent-flow");
const CONFIG_FILE = path.join(APP_DIR, "config.json");

const DEFAULTS = {
  projectsPath: path.join(APP_DIR, "projects"),
  boards: [],
};

function ensureDirs() {
  fs.mkdirSync(path.join(APP_DIR, "projects"), { recursive: true });
}

ensureDirs();

export function getConfig() {
  ensureDirs();
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setConfig(updates) {
  ensureDirs();
  const current = getConfig();
  const next = { ...current, ...updates };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

// ── Worktrees ──────────────────────────────────────────────────────────────────

export function getWorktrees() {
  return getConfig().worktrees ?? [];
}

export function registerWorktree({ owner, repo, branch, cardNumber, repoDir, worktreeDir }) {
  const id       = `${owner}/${repo}#${cardNumber}`;
  const existing = getWorktrees().filter((w) => w.id !== id);
  const entry    = {
    id,
    cardNumber,
    repo: `${owner}/${repo}`,
    branch,
    path:      worktreeDir,
    repoDir,
    createdAt: new Date().toISOString(),
  };
  setConfig({ worktrees: [...existing, entry] });
  return entry;
}

export function removeWorktree(id) {
  setConfig({ worktrees: getWorktrees().filter((w) => w.id !== id) });
}

export function updateWorktreeStatus(id, updates) {
  setConfig({
    worktrees: getWorktrees().map((w) => w.id === id ? { ...w, ...updates } : w),
  });
}
