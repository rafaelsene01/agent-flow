import { verifyBotAndDetectChat } from "../modules/integrations/telegram.service.js";
import { withPollerSuspended } from "../modules/integrations/telegram.poller.js";
import { getConfig } from "../modules/config/config.service.js";
import { sendError } from "../lib/errors.js";

export default function integrationsRoutes(app) {
  // Verifica o bot do Telegram e detecta o chat id via getUpdates, confirmando
  // no próprio chat. Usa o token colado no modal (body) ou o já salvo no config.
  app.post("/api/integrations/telegram/verify", async (req, res) => {
    const botToken =
      req.body?.botToken?.trim() || getConfig().integrations?.telegram?.botToken;
    if (!botToken) return sendError(res, 400, "Bot token ausente");
    try {
      // Suspende o poller de respostas durante a verificação — getUpdates
      // simultâneos com o mesmo token conflitam (409) na API do Telegram.
      res.json(await withPollerSuspended(() => verifyBotAndDetectChat(botToken)));
    } catch (err) {
      res.status(400).json({ error: err.message, code: err.code ?? "telegram-error" });
    }
  });
}
