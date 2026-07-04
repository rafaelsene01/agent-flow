import { getChat, startChat, sendMessage } from "../modules/board-chat/board-chat.service.js";
import { sendError } from "../lib/errors.js";

// IDs de board são node IDs do GitHub (ex: PVT_kwHO…) — alfanuméricos com _ e -.
const BOARD_ID_RE = /^[a-zA-Z0-9_=-]+$/;

export default function boardChatRoutes(app) {
  // Chat registrado para o board (ou { chat: null }) — decide entre
  // "continuar/novo" e "novo direto" no modal.
  app.get("/api/board-chat/:boardId", (req, res) => {
    const { boardId } = req.params;
    if (!BOARD_ID_RE.test(boardId)) return sendError(res, 400, "boardId inválido");
    try {
      res.json({ chat: getChat(boardId) });
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  // Inicia um chat novo: apaga chat/worktree anteriores do board, cria a worktree
  // na branch selecionada e roda o primeiro turno. Retorna { text }.
  app.post("/api/board-chat/:boardId/start", async (req, res) => {
    const { boardId } = req.params;
    if (!BOARD_ID_RE.test(boardId)) return sendError(res, 400, "boardId inválido");
    const { repo, branch, model, effort, prompt } = req.body ?? {};
    if (typeof repo !== "string" || !repo.includes("/"))
      return sendError(res, 400, "repo obrigatório (owner/nome)");
    if (typeof branch !== "string" || !branch.trim())
      return sendError(res, 400, "branch obrigatória");
    if (typeof prompt !== "string" || !prompt.trim())
      return sendError(res, 400, "prompt obrigatório");
    try {
      res.json(await startChat({ boardId, repo, branch: branch.trim(), model, effort, prompt }));
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  // Turno seguinte do chat existente. Retorna { text }.
  app.post("/api/board-chat/:boardId/message", async (req, res) => {
    const { boardId } = req.params;
    if (!BOARD_ID_RE.test(boardId)) return sendError(res, 400, "boardId inválido");
    const { prompt, model, effort } = req.body ?? {};
    if (typeof prompt !== "string" || !prompt.trim())
      return sendError(res, 400, "prompt obrigatório");
    try {
      res.json(await sendMessage({ boardId, prompt, model, effort }));
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });
}
