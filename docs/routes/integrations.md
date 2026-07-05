# Rotas — /api/integrations

Fonte: `api/routes/integrations.js` — lógica em [modules/integrations.md](../modules/integrations.md).

---

## POST /api/integrations/telegram/verify

Verifica o bot do Telegram e detecta o chat id via `getUpdates`, confirmando no próprio chat.

**Body:** `{ botToken? }` — usa o token do body ou o já salvo em `config.integrations.telegram.botToken`. `400` se ausente.

Durante a verificação o poller de respostas é suspenso — `getUpdates` simultâneos com o mesmo token conflitam (`409`) na API do Telegram.

**Erro:** `400 { error, code }` (`code` default `"telegram-error"`).
