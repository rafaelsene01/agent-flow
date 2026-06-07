import { execFileSync, execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const KNOWN_PROVIDERS = [
  { id: "anthropic",  name: "Anthropic",       keyEnv: "ANTHROPIC_API_KEY",       modelsUrl: "https://api.anthropic.com/v1/models" },
  { id: "openai",     name: "OpenAI",           keyEnv: "OPENAI_API_KEY",          modelsUrl: "https://api.openai.com/v1/models" },
  { id: "google",     name: "Google Gemini",    keyEnv: "GOOGLE_API_KEY",          modelsUrl: null },
  { id: "groq",       name: "Groq",             keyEnv: "GROQ_API_KEY",            modelsUrl: "https://api.groq.com/openai/v1/models" },
  { id: "mistral",    name: "Mistral",          keyEnv: "MISTRAL_API_KEY",         modelsUrl: "https://api.mistral.ai/v1/models" },
  { id: "deepseek",   name: "DeepSeek",         keyEnv: "DEEPSEEK_API_KEY",        modelsUrl: "https://api.deepseek.com/v1/models" },
  { id: "openrouter", name: "OpenRouter",       keyEnv: "OPENROUTER_API_KEY",      modelsUrl: "https://openrouter.ai/api/v1/models" },
  { id: "bedrock",    name: "AWS Bedrock",      keyEnv: null,                      modelsUrl: null },
  { id: "azure",      name: "Azure OpenAI",     keyEnv: "AZURE_OPENAI_API_KEY",    modelsUrl: null },
];

const STATIC_MODELS = {
  anthropic: [
    { id: "claude-opus-4-5",          name: "Claude Opus 4.5" },
    { id: "claude-sonnet-4-5",        name: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5",         name: "Claude Haiku 4.5" },
    { id: "claude-opus-4",            name: "Claude Opus 4" },
    { id: "claude-sonnet-4",          name: "Claude Sonnet 4" },
  ],
  google: [
    { id: "gemini-2.5-pro",           name: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash",         name: "Gemini 2.5 Flash" },
    { id: "gemini-2.0-flash",         name: "Gemini 2.0 Flash" },
    { id: "gemini-1.5-pro",           name: "Gemini 1.5 Pro" },
  ],
  azure: [
    { id: "gpt-4o",                   name: "GPT-4o" },
    { id: "gpt-4-turbo",              name: "GPT-4 Turbo" },
    { id: "gpt-35-turbo",             name: "GPT-3.5 Turbo" },
  ],
  bedrock: [
    { id: "anthropic.claude-3-5-sonnet-20241022-v2:0", name: "Claude 3.5 Sonnet (Bedrock)" },
    { id: "anthropic.claude-3-5-haiku-20241022-v1:0",  name: "Claude 3.5 Haiku (Bedrock)" },
    { id: "amazon.nova-pro-v1:0",     name: "Amazon Nova Pro" },
    { id: "amazon.nova-lite-v1:0",    name: "Amazon Nova Lite" },
  ],
};

export function isInstalled() {
  try {
    execFileSync("opencode", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    try {
      execSync("where opencode", { stdio: "pipe" });
      return true;
    } catch {
      try {
        execSync("which opencode", { stdio: "pipe" });
        return true;
      } catch {
        return false;
      }
    }
  }
}

export function getVersion() {
  try {
    const out = execFileSync("opencode", ["--version"], { stdio: "pipe" }).toString().trim();
    return out;
  } catch {
    return null;
  }
}

function getConfigPath() {
  const platform = os.platform();
  if (platform === "win32") {
    return path.join(os.homedir(), "AppData", "Roaming", "opencode", "config.json");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "opencode", "config.json");
  }
  return path.join(os.homedir(), ".config", "opencode", "config.json");
}

export function readConfig() {
  const cfgPath = getConfigPath();
  if (!fs.existsSync(cfgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  } catch {
    return null;
  }
}

export function getConfiguredProviders() {
  const cfg = readConfig();
  const configured = [];

  for (const p of KNOWN_PROVIDERS) {
    let hasKey = false;

    if (p.keyEnv && process.env[p.keyEnv]) {
      hasKey = true;
    }

    if (cfg?.providers?.[p.id]?.apiKey) {
      hasKey = true;
    }

    if (cfg?.providers?.[p.id]?.enabled === false) continue;

    configured.push({ ...p, hasKey });
  }

  return configured;
}

export function getAllProviders() {
  const cfg = readConfig();
  return KNOWN_PROVIDERS.map((p) => {
    const storedKey = cfg?.providers?.[p.id]?.apiKey || null;
    const envKey    = p.keyEnv ? !!process.env[p.keyEnv] : false;
    return { ...p, hasKey: !!(storedKey || envKey), storedKey };
  });
}

export async function fetchModels(providerId, apiKey) {
  const provider = KNOWN_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) throw new Error(`Provider "${providerId}" desconhecido.`);

  if (STATIC_MODELS[providerId]) {
    return STATIC_MODELS[providerId];
  }

  if (!provider.modelsUrl) {
    return [];
  }

  const headers = { "Content-Type": "application/json" };

  if (providerId === "openai" || providerId === "deepseek") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (providerId === "groq") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (providerId === "mistral") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (providerId === "openrouter") {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"]  = "https://github.com/agent-flow";
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(provider.modelsUrl, { headers });
  if (!res.ok) throw new Error(`Erro ao buscar modelos: HTTP ${res.status}`);

  const json = await res.json();

  const raw = json.data ?? json.models ?? json;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((m) => ({ id: m.id, name: m.name || m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
