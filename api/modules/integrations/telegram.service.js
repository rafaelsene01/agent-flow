import { getConfig, getLanguage } from "../config/config.service.js";

// Notificações do Telegram: disparadas nas transições de status dos runs
// (ver hook em agent-runs.store.js → patchRun). O envio é fire-and-forget —
// falha de rede/config nunca derruba um run, só loga no console.

const EVENT_FLAG = {
  error: "notifyOnError",
  waiting: "notifyOnWaitingInput",
  "chain-done": "notifyOnAllDone",
};

function telegramConfig() {
  const tg = getConfig().integrations?.telegram;
  if (!tg?.enabled || !tg.botToken || !tg.chatId) return null;
  return tg;
}

// Opções da pergunta pendente: vivem no último turn `question` (coluna `turns`,
// JSON), não em pending_question. Parse local — importar o store criaria import
// circular (o store importa este módulo).
function pendingOptions(run) {
  try {
    const turns = JSON.parse(run.turns ?? "[]");
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].type === "question") return turns[i].options ?? [];
    }
  } catch {}
  return [];
}

// Monta a mensagem do evento. A última linha (`ref: …`) é machine-readable:
// quando o usuário responder no Telegram, é ela que permitirá mapear a resposta
// de volta ao card/run — retomar com um prompt de entrada ou liberar o breakpoint.
function buildMessage(run, event) {
  const pt = getLanguage() === "pt";
  const title = {
    error: pt ? "🔴 Erro na execução" : "🔴 Run failed",
    waiting:
      run.status === "waiting-approval"
        ? pt ? "⏸️ Ponto de parada aguardando aprovação" : "⏸️ Breakpoint awaiting approval"
        : pt ? "❓ Agente aguardando entrada" : "❓ Agent awaiting input",
    "chain-done": pt ? "✅ Pipeline do card finalizada" : "✅ Card pipeline finished",
  }[event];

  const cardLine = `Card: #${run.card_number ?? "?"} — ${run.card_title ?? ""}`.trim();
  // Fim de pipeline não espera resposta: mensagem mínima, sem a linha `ref:`.
  if (event === "chain-done") return [title, "", cardLine].join("\n");

  const lines = [
    title,
    "",
    cardLine,
    `${pt ? "Repositório" : "Repository"}: ${run.repo}`,
    `${pt ? "Agente" : "Agent"}: ${run.agent_name}`,
    `Branch: ${run.target_branch}`,
  ];
  if (event === "error" && run.last_error) {
    lines.push("", `${pt ? "Erro" : "Error"}: ${String(run.last_error).slice(0, 500)}`);
  }
  if (event === "waiting" && run.pending_question) {
    lines.push("", `${pt ? "Pergunta" : "Question"}: ${String(run.pending_question).slice(0, 500)}`);
    for (const opt of pendingOptions(run)) lines.push(`- ${opt}`);
  }
  lines.push(
    "",
    `ref: card=${run.repo}#${run.card_number ?? ""} run=${run.id} chain=${run.chain_id ?? ""}`,
  );
  return lines.join("\n");
}

async function sendMessage(tg, text) {
  const res = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: tg.chatId, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram API ${res.status}: ${body.slice(0, 200)}`);
  }
}

// Verifica o bot e descobre o chat id: consulta getUpdates, pega o chat da
// atualização mais recente e envia a confirmação no próprio chat (a mensagem
// inclui o chat id). Lança erro com `code` para o frontend traduzir:
// 'invalid-token' | 'no-updates'.
export async function verifyBotAndDetectChat(botToken) {
  const call = async (method, body) => {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 404) {
      const err = new Error("Bot token inválido");
      err.code = "invalid-token";
      throw err;
    }
    if (!data?.ok) throw new Error(`Telegram API: ${data?.description ?? res.status}`);
    return data.result;
  };

  const updates = await call("getUpdates");
  let chat = null;
  for (const u of updates) {
    const c = u.message?.chat ?? u.edited_message?.chat ?? u.my_chat_member?.chat;
    if (c) chat = c; // fica com o mais recente
  }
  if (!chat) {
    const err = new Error("O bot ainda não recebeu nenhuma mensagem");
    err.code = "no-updates";
    throw err;
  }

  const chatId = String(chat.id);
  const name =
    chat.title || chat.username || [chat.first_name, chat.last_name].filter(Boolean).join(" ");
  const pt = getLanguage() === "pt";
  await call("sendMessage", {
    chat_id: chatId,
    text: pt
      ? `✅ Agent Flow conectado! Seu chat id é ${chatId} — ele já foi preenchido no app.`
      : `✅ Agent Flow connected! Your chat id is ${chatId} — it has been filled in the app.`,
  });
  return { chatId, name };
}

// event: 'error' | 'waiting' | 'chain-done'. Fire-and-forget — nunca lança.
export function notifyRunEvent(run, event) {
  try {
    const tg = telegramConfig();
    if (!tg || !tg[EVENT_FLAG[event]]) return;
    sendMessage(tg, buildMessage(run, event)).catch((err) =>
      console.error(`[telegram] envio falhou (${event}):`, err.message),
    );
  } catch (err) {
    console.error(`[telegram] notifyRunEvent falhou (${event}):`, err.message);
  }
}
