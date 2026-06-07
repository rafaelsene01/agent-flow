import fs from "fs";
import os from "os";
import path from "path";

const APP_DIR     = path.join(os.homedir(), ".agent-flow");
const CONFIG_FILE = path.join(APP_DIR, "config.json");

const DEFAULTS = {
  projectsPath: path.join(APP_DIR, "projects"),
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
