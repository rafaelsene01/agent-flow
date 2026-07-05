# Módulo — Integrations (Telegram)

Fonte: `api/modules/integrations/`

Notificações de eventos de run no Telegram e recepção de respostas do usuário via reply.

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `telegram.service.js` | `verifyBotAndDetectChat(botToken)`, `notifyRunEvent(run, event)` |
| `telegram.poller.js` | `startTelegramPolling()`, `withPollerSuspended(fn)` |

---

## telegram.service.js

- `verifyBotAndDetectChat(botToken)` — valida o bot e detecta o chat id via `getUpdates`, confirmando no próprio chat. Config salva em `config.integrations.telegram`.
- `notifyRunEvent(run, event)` — envia notificação de evento de run (pergunta pendente, done, erro) para o chat configurado.

## telegram.poller.js

- `startTelegramPolling()` — iniciado no boot do servidor; escuta replies do usuário às notificações de card e encaminha como resposta ao run.
- `withPollerSuspended(fn)` — suspende o poller durante `fn` — `getUpdates` simultâneos com o mesmo token conflitam (`409`) na API do Telegram.
