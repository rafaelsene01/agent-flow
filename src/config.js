import fs from "fs";
import path from "path";

const CONFIG_FILE = ".agent-flow.json";

export function getConfigPath() {
  return path.join(process.cwd(), CONFIG_FILE);
}

export function readConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeConfig(config) {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function requireConfig() {
  const config = readConfig();
  if (!config) {
    console.error(
      '\n  No config found. Run \u001b[33magent-flow init\u001b[0m to set up your board.\n'
    );
    process.exit(1);
  }
  return config;
}
