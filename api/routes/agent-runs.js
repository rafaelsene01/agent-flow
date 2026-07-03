import fs from "fs";
import path from "path";
import { getAgent } from "../modules/agents/agents.service.js";
import { getRun, getChain, listRuns, listRunsForCard, runsAttentionSummary, patchRun, appendTurn } from "../modules/agent-runs/agent-runs.store.js";
import { enqueue, enqueueChain, tick } from "../modules/agent-runs/agent-runs.queue.js";
import { registerSseClient } from "../modules/claude/claude.runner.js";
import { cancelProcess } from "../modules/claude/claude.concurrency.js";
import { getWorktrees } from "../modules/config/config.service.js";
import { sendError } from "../lib/errors.js";

export default function agentRunsRoutes(app) {
  app.post("/api/agent-runs", (req, res) => {
    const { agentId, repo, cardNumber, title, body, originBranch, targetBranch, model, effort } = req.body ?? {};
    if (!agentId || !repo || !originBranch || !targetBranch)
      return sendError(res, 400, "agentId, repo, originBranch e targetBranch são obrigatórios.");

    const agent = getAgent(agentId);
    if (!agent) return sendError(res, 400, "Agente não encontrado.");

    try {
      const run = enqueue({
        agentId,
        agentName: agent.name,
        repo,
        cardNumber,
        cardTitle: title,
        cardBody: body,
        originBranch,
        targetBranch,
        model: model || agent.model,
        effort: effort || agent.effort,
      });
      res.json({ run });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  // Enfileira uma pipeline ordenada de agentes na worktree já configurada
  // (aba "Configurar Branch" do card). Cada passo só roda quando o anterior
  // terminou `done`, mesmo entre agentes diferentes.
  app.post("/api/agent-runs/chain", (req, res) => {
    const { worktreeId, title, body, steps } = req.body ?? {};
    if (!worktreeId) return sendError(res, 400, "worktreeId é obrigatório.");
    if (!Array.isArray(steps) || steps.length === 0)
      return sendError(res, 400, "Informe ao menos um agente.");

    const wt = getWorktrees().find((w) => w.id === worktreeId);
    if (!wt) return sendError(res, 400, "Worktree não configurada para este card.");

    // Resolve o nome de cada agente (denormalizado, resiliente a delete) e valida.
    const resolved = [];
    for (const step of steps) {
      const agent = getAgent(step.agentId);
      if (!agent) return sendError(res, 400, `Agente não encontrado: ${step.agentId}`);
      resolved.push({
        id: step.id,
        agentId: agent.id,
        agentName: agent.name,
        model: step.model || agent.model,
        effort: step.effort || agent.effort,
      });
    }

    try {
      const runs = enqueueChain({
        steps: resolved,
        repo: wt.repo,
        cardNumber: wt.cardNumber,
        cardTitle: title,
        cardBody: body,
        originBranch: wt.originBranch,
        targetBranch: wt.branch,
        worktreePath: wt.path,
        helpersDir: wt.helpersDir,
      });
      res.json({ runs });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.get("/api/agent-runs", (req, res) => {
    try {
      const { repo, card } = req.query;
      if (repo && card != null && card !== "") {
        return res.json({ runs: listRunsForCard(repo, Number(card)) });
      }
      res.json({ runs: listRuns() });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  // Resumo por card (waiting/active) para sinalizar no board. Registrado antes de
  // "/:id" para não ser capturado como um id.
  app.get("/api/agent-runs/attention", (_req, res) => {
    try {
      res.json({ cards: runsAttentionSummary() });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  // Todos os runs da pipeline (chain) a que este run pertence, em ordem — a "conversa".
  app.get("/api/agent-runs/:id/chain", (req, res) => {
    const runs = getChain(req.params.id);
    if (!runs.length) return sendError(res, 404, "Run não encontrado.");
    res.json({ runs });
  });

  app.get("/api/agent-runs/:id", (req, res) => {
    const run = getRun(req.params.id);
    if (!run) return sendError(res, 404, "Run não encontrado.");
    res.json({ run });
  });

  // Enfileira a resposta/mensagem do usuário: o run volta para a fila com resume=1 e
  // a mensagem como entrada. O dispatcher retoma a sessão (mesmo session_id) quando o
  // agente ficar livre — pode estar ocupado com outro run desbloqueado nesse meio-tempo.
  app.post("/api/agent-runs/:id/message", (req, res) => {
    const { message } = req.body ?? {};
    if (!message?.trim()) return sendError(res, 400, "Mensagem obrigatória.");

    const run = getRun(req.params.id);
    if (!run) return sendError(res, 404, "Run não encontrado.");
    if (run.status === "queued" || run.status === "processing")
      return sendError(res, 409, "Run está ocupado.");

    // Registra a resposta como turn (fica no chat) antes de re-enfileirar.
    appendTurn(run.id, { type: "answer", text: message.trim() });
    patchRun(run.id, {
      status: "queued",
      resume: 1,
      resume_message: message.trim(),
      pending_question: null,
      last_error: null,
    });
    tick();
    res.json({ ok: true });
  });

  app.get("/api/agent-runs/:id/log/stream", (req, res) => {
    const id = req.params.id;
    const run = getRun(id);
    if (!run) return sendError(res, 404, "Run não encontrado.");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    const cleanup = registerSseClient(id, res);
    req.on("close", cleanup);
  });

  app.get("/api/agent-runs/:id/log", (req, res) => {
    const run = getRun(req.params.id);
    if (!run) return sendError(res, 404, "Run não encontrado.");
    if (!run.helpers_dir) return res.json({ content: "" });

    // ?file=<segmento>: valida contra os logFiles registrados nos turns (evita path
    // traversal). Sem file, usa o log_file atual (compat).
    let file = req.query.file || run.log_file;
    if (req.query.file) {
      let turnFiles = [];
      try {
        turnFiles = (JSON.parse(run.turns || "[]") || [])
          .filter((tn) => tn.type === "exec" && tn.logFile)
          .map((tn) => tn.logFile);
      } catch { /* turns inválido → nega */ }
      if (!turnFiles.includes(req.query.file)) {
        return sendError(res, 400, "Arquivo de log inválido.");
      }
      file = req.query.file;
    }
    if (!file) return res.json({ content: "" });
    const logPath = path.join(run.helpers_dir, file);
    const content = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf-8") : "";
    res.json({ content });
  });

  app.post("/api/agent-runs/:id/cancel", (req, res) => {
    const run = getRun(req.params.id);
    if (!run) return sendError(res, 404, "Run não encontrado.");

    if (run.status === "queued") {
      patchRun(run.id, { status: "error", last_error: "Cancelado pelo usuário." });
      return res.json({ ok: true });
    }
    if (run.status === "processing") {
      cancelProcess(run.id);
      patchRun(run.id, { status: "error", last_error: "Cancelado pelo usuário." });
      return res.json({ ok: true });
    }
    sendError(res, 409, "Run não está ativo.");
  });
}
