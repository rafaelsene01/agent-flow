import { execSync } from "child_process";
import { validateToken } from "./github.client.js";
import { setConfig } from "../config/config.service.js";

// Remove tokens de ambiente para que o gh use suas próprias credenciais
function ghEnv() {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  delete env.GITHUB_KEY;
  delete env.GITHUB_AUTH_TOKEN;
  return env;
}

function save(result) {
  if (result.connected) setConfig({ githubMethod: result.method });
  return result;
}

export async function getStatus() {
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;
  if (envToken) {
    try {
      const user = await validateToken(envToken);
      return save({ connected: true, method: "env", user: user.login, name: user.name });
    } catch {
      // token inválido — continua para gh CLI
    }
  }

  let ghInstalled = false;
  try {
    execSync("gh --version", { stdio: "pipe", timeout: 3000, shell: true });
    ghInstalled = true;
  } catch {}

  if (!ghInstalled) {
    return { connected: false, error: "gh CLI não instalado" };
  }

  try {
    const out = execSync("gh api user", { stdio: "pipe", encoding: "utf-8", timeout: 8000, shell: true, env: ghEnv() });
    const user = JSON.parse(out);
    return save({ connected: true, method: "gh-cli", user: user.login, name: user.name });
  } catch (err) {
    const msg = (err.stderr?.toString() || err.stdout?.toString() || err.message || "").trim();
    return { connected: false, error: msg || "Erro ao executar gh api user" };
  }
}
