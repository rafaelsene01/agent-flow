import fs from "fs";
import path from "path";

const CONFIG_FILE = ".agent-flow.json";

export function getConfigPath() {
  return path.join(process.cwd(), CONFIG_FILE);
}

export function readConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

export function writeConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
}
