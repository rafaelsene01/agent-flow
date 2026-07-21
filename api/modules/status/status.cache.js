import { getStatus as getGithubStatus } from "../github/github.service.js";
import { getStatus as getClaudeStatus } from "../claude/claude.service.js";

// Sem cache persistente: a rota /api/status é consultada uma vez por abertura de
// tela, e cachear congelava erros transitórios (ex.: GitHub 503 no boot ficava
// "fora do ar" para sempre). Só deduplica chamadas concorrentes em voo.
let inflight = null;

export async function refresh() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [github, claude] = await Promise.all([getGithubStatus(), getClaudeStatus()]);
      return { platform: process.platform, github, claude, cachedAt: Date.now() };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
