import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const APP_DIR = path.join(os.homedir(), ".agent-flow");
const DB_FILE = path.join(APP_DIR, "agent-runs.db");

let db = null;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(APP_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id            TEXT PRIMARY KEY,
      session_id    TEXT NOT NULL,
      kind          TEXT NOT NULL DEFAULT 'agent',
      agent_id      TEXT NOT NULL,
      agent_name    TEXT NOT NULL,
      repo          TEXT NOT NULL,
      card_number   INTEGER,
      card_title    TEXT,
      card_body     TEXT,
      origin_branch TEXT NOT NULL,
      target_branch TEXT NOT NULL,
      worktree_path TEXT,
      helpers_dir   TEXT,
      log_file      TEXT,
      model         TEXT NOT NULL DEFAULT 'sonnet',
      effort        TEXT NOT NULL DEFAULT 'medium',
      status        TEXT NOT NULL DEFAULT 'queued',
      resume        INTEGER NOT NULL DEFAULT 0,
      depends_on    TEXT,
      chain_id      TEXT,
      resume_message TEXT,
      turns         TEXT,
      pending_question TEXT,
      last_error    TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      started_at    TEXT,
      finished_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);
  `);
  // Migrações: colunas adicionadas depois da criação inicial da tabela.
  const cols = db.prepare(`PRAGMA table_info(agent_runs)`).all().map((c) => c.name);
  if (!cols.includes("depends_on")) db.exec(`ALTER TABLE agent_runs ADD COLUMN depends_on TEXT`);
  if (!cols.includes("chain_id")) db.exec(`ALTER TABLE agent_runs ADD COLUMN chain_id TEXT`);
  if (!cols.includes("resume_message")) db.exec(`ALTER TABLE agent_runs ADD COLUMN resume_message TEXT`);
  if (!cols.includes("turns")) db.exec(`ALTER TABLE agent_runs ADD COLUMN turns TEXT`);
  if (!cols.includes("kind")) db.exec(`ALTER TABLE agent_runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'agent'`);
  return db;
}
