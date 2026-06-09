import { getStatus as getGithubStatus } from "../github/github.service.js";
import { getStatus as getClaudeStatus } from "../claude/claude.service.js";

let cache = null;
let refreshing = false;

export function getCache() {
  return cache;
}

export async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const [github, claude] = await Promise.all([getGithubStatus(), getClaudeStatus()]);
    cache = { platform: process.platform, github, claude, cachedAt: Date.now() };
  } finally {
    refreshing = false;
  }
  return cache;
}

export function warmup() {
  refresh().catch((err) => console.error("[status] warmup error:", err));
}
