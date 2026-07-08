import fs from "fs";
import path from "path";
import express from "express";
import statusRoutes from "./routes/status.js";
import configRoutes from "./routes/config.js";
import githubRoutes from "./routes/github.js";
import usageRoutes from "./routes/usage.js";
import usageStatsRoutes from "./routes/usage-stats.js";
import skillsRoutes from "./routes/skills.js";
import agentsRoutes from "./routes/agents.js";
import agentRunsRoutes from "./routes/agent-runs.js";
import boardChatRoutes from "./routes/board-chat.js";
import integrationsRoutes from "./routes/integrations.js";
import updateRoutes from "./routes/update.js";
import { warmup } from "./modules/status/status.cache.js";
import { warmItemsCache, startItemsPolling } from "./modules/github/github.items.js";
import { WEB_DIST_DIR } from "./paths.js";
import { getConfig, getWorktrees, updateWorktreeStatus } from "./modules/config/config.service.js";
import { recoverAndDispatch } from "./modules/agent-runs/agent-runs.queue.js";
import { startTelegramPolling } from "./modules/integrations/telegram.poller.js";

function recoverInterruptedRuns() {
  // Todos os campos que o runner marca como "running". Se o servidor reinicia ou
  // cai no meio de um run, o processo morre mas o campo fica preso em "running" —
  // o que mantém o card girando "executando" no board para sempre. Reconcilia
  // qualquer um deles para "error" no boot.
  const RUN_FIELDS = [
    ["messageStatus", "messageLastError"],
    ["pullStatus",    "pullLastError"],
  ];
  const MSG = "Run interrompido por reinício do servidor";
  for (const wt of getWorktrees()) {
    const patch = {};
    for (const [field, errField] of RUN_FIELDS) {
      if (wt[field] === "running") {
        patch[field] = "error";
        patch[errField] = MSG;
      }
    }
    if (Object.keys(patch).length) updateWorktreeStatus(wt.id, patch);
  }
}

export async function startServer({ port, host, apiOnly = false }) {
  if (!apiOnly && !fs.existsSync(WEB_DIST_DIR)) {
    throw new Error(
      `Frontend não encontrado em ${WEB_DIST_DIR}\n` +
      `  Execute "npm run build" antes de usar.`
    );
  }

  recoverInterruptedRuns();

  const app = express();
  app.use(express.json());

  statusRoutes(app);
  configRoutes(app);
  githubRoutes(app);
  usageRoutes(app);
  usageStatsRoutes(app);
  skillsRoutes(app);
  agentsRoutes(app);
  agentRunsRoutes(app);
  boardChatRoutes(app);
  integrationsRoutes(app);
  updateRoutes(app);
  recoverAndDispatch();
  // Escuta respostas do usuário no Telegram (reply às notificações de card).
  startTelegramPolling();

  if (!apiOnly) {
    // redirect:false evita que "/agent" seja redirecionado para "/agent/" (o export
    // cria um diretório homônimo), o que quebraria a resolução do .html abaixo.
    app.use(express.static(WEB_DIST_DIR, { redirect: false }));
    // Detalhe do board: slugs são de runtime, então servimos o shell estático do
    // [slug] ("_") para qualquer /board/<slug> — o cliente resolve pelo pathname.
    app.get("/board/:slug", (_req, res) => res.sendFile("board/_.html", { root: WEB_DIST_DIR }));
    // Rotas do App Router exportam "<rota>.html". O export também cria um diretório
    // "<rota>/" (com os segmentos RSC), que faz o express.static ignorar o .html —
    // por isso resolvemos o HTML da rota manualmente aqui. Fallback final: home.
    app.use((req, res) => {
      const htmlPath = path.join(WEB_DIST_DIR, `${req.path}.html`);
      if (req.path !== "/" && htmlPath.startsWith(WEB_DIST_DIR) && fs.existsSync(htmlPath)) {
        // Sempre com { root }: sem ele o send aplica a política de dotfiles ao
        // caminho absoluto inteiro, e instalações sob ~/.agent-flow (segmento
        // com ponto) respondem 404 para toda rota que cai aqui.
        return res.sendFile(`${req.path.slice(1)}.html`, { root: WEB_DIST_DIR });
      }
      res.sendFile("index.html", { root: WEB_DIST_DIR });
    });
  }

  // Garante que erros não capturados retornem JSON, nunca "Internal Server Error" em texto.
  app.use((err, _req, res, _next) => {
    console.error("[server error]", err);
    if (res.headersSent) return;
    res.status(500).json({ error: err?.message ?? String(err) });
  });

  // Default localhost (só a própria máquina). Para expor na rede (ex.: acessar
  // de outra máquina), passe host="0.0.0.0" via --host ou AGENT_FLOW_HOST.
  const bindHost = host || process.env.AGENT_FLOW_HOST || "localhost";
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, bindHost, () => resolve(s));
    s.on("error", (err) => {
      reject(err.code === "EADDRINUSE"
        ? new Error(`Porta ${port} já está em uso. Use --port para escolher outra.`)
        : err);
    });
  });

  // Requisições de items com viewFilter podem varrer várias páginas do GitHub
  // (>30s). Mantém timeouts generosos para não cortar a resposta no meio.
  server.requestTimeout = 180_000; // tempo total da requisição
  server.headersTimeout = 185_000; // deve ser > requestTimeout
  server.keepAliveTimeout = 125_000; // > proxyTimeout do Next (120s)

  warmup();
  // Pré-aquece o cache de itens de cada board para o board carregar instantâneo.
  for (const b of getConfig().boards ?? []) warmItemsCache(b.id);
  // Mantém os cards frescos: revalida todos os boards em background a cada 60s,
  // mesmo sem ninguém acessando. Lê a config a cada tick para pegar boards novos.
  startItemsPolling(() => (getConfig().boards ?? []).map((b) => b.id));

  return { app, server, url: `http://${bindHost}:${port}` };
}
