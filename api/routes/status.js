import { execSync } from "child_process";
import * as github from "../clients/github.js";

async function getGithubStatus() {
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_KEY;
  if (envToken) {
    try {
      const user = await github.validateToken(envToken);
      return { connected: true, method: "env", user: user.login, name: user.name };
    } catch {
      // token inválido — continua para gh CLI e SSH
    }
  }

  let ghInstalled = false;
  try {
    execSync("gh --version", { stdio: "pipe", timeout: 3000 });
    ghInstalled = true;
  } catch {}

  if (ghInstalled) {
    try {
      const out = execSync("gh api user", { stdio: "pipe", encoding: "utf-8", timeout: 8000 });
      const user = JSON.parse(out);
      return { connected: true, method: "gh-cli", user: user.login, name: user.name };
    } catch {
      // gh pode pegar o mesmo token inválido do ambiente — continua para SSH
    }
  }

  // ssh -T exits with code 1 even on success — combine stdout+stderr.
  // shell:true garante que ssh esteja no PATH no contexto do Node.js no Windows.
  try {
    const out = execSync(
      "ssh -T -o StrictHostKeyChecking=no git@github.com",
      { stdio: "pipe", encoding: "utf-8", timeout: 10000, shell: true }
    );
    const match = (out || "").match(/Hi (.+?)!/);
    if (match) return { connected: true, method: "ssh", user: match[1] };
  } catch (err) {
    const combined = (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
    const match = combined.match(/Hi (.+?)!/);
    if (match) return { connected: true, method: "ssh", user: match[1] };
  }

  // Fallback: git usa seu próprio stack SSH, mais confiável no Windows.
  try {
    execSync(
      "git ls-remote git@github.com:github/gitignore.git HEAD",
      { stdio: "pipe", timeout: 10000, shell: true }
    );
    return { connected: true, method: "ssh" };
  } catch {}

  return { connected: false };
}

async function getClaudeStatus() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      if (res.ok) return { connected: true, method: "env" };
      return { connected: false, method: "env", error: "API key inválida" };
    } catch {
      return { connected: false, method: "env", error: "Sem conexão com Anthropic" };
    }
  }
  try {
    const version = execSync("claude --version", {
      stdio: "pipe", encoding: "utf-8", timeout: 5000,
    }).trim();
    return { connected: true, method: "claude-cli", version };
  } catch {
    return { connected: false };
  }
}

export default function statusRoutes(app) {
  app.get("/api/status", async (_req, res) => {
    try {
      const [githubStatus, claudeStatus] = await Promise.all([
        getGithubStatus(),
        getClaudeStatus(),
      ]);
      res.json({ platform: process.platform, github: githubStatus, claude: claudeStatus });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
