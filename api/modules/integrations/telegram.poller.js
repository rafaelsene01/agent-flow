import { getConfig, getLanguage } from "../config/config.service.js";
import { getRun, listRuns, appendTurn, patchRun } from "../agent-runs/agent-runs.store.js";
import { tick, approveBreakpoint } from "../agent-runs/agent-runs.queue.js";

// Poller de respostas do Telegram: long-polling em getUpdates. Quando o usuário
// responde (reply) à mensagem de um card, a linha `ref: … run=<id>` da mensagem
// original identifica o run: waiting-input recebe o texto como resposta do
// usuário (mesmo fluxo do POST /api/agent-runs/:id/message) e waiting-approval
// (ponto de parada) é liberado. Mensagem solta (sem reply) só funciona quando há
// exatamente um run aguardando.

let started = false;
let suspended = false;
let abortCtl = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Suspende o long-poll enquanto `fn` roda — o "Verificar conexão" do modal também
// chama getUpdates, e duas chamadas simultâneas com o mesmo token conflitam (409).
export async function withPollerSuspended(fn) {
  suspended = true;
  abortCtl?.abort();
  try {
    return await fn();
  } finally {
    suspended = false;
  }
}

function parseRunRef(text) {
  const m = /ref:.*\brun=([0-9a-f-]+)/i.exec(text ?? "");
  return m?.[1] ?? null;
}

async function api(botToken, method, body, signal) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!data?.ok) throw new Error(`Telegram ${method}: ${data?.description ?? res.status}`);
  return data.result;
}

// Executa a ação no run e devolve o texto de confirmação para o chat.
function actOnRun(runId, text, pt) {
  const run = getRun(runId);
  if (!run) {
    return pt ? "Não encontrei esse run — talvez tenha sido apagado." : "Run not found — it may have been deleted.";
  }
  if (run.status === "waiting-approval") {
    approveBreakpoint(run.id);
    return pt
      ? `✅ Ponto de parada liberado (card #${run.card_number ?? "?"}) — a pipeline continua.`
      : `✅ Breakpoint released (card #${run.card_number ?? "?"}) — the pipeline continues.`;
  }
  if (run.status === "queued" || run.status === "processing") {
    return pt
      ? `⏳ O agente ${run.agent_name} está ocupado agora — tente quando ele pausar.`
      : `⏳ Agent ${run.agent_name} is busy right now — try again when it pauses.`;
  }
  // waiting-input (e também runs done/error, como no endpoint /message da UI):
  // registra a resposta e re-enfileira o run com ela como entrada.
  appendTurn(run.id, { type: "answer", text });
  patchRun(run.id, {
    status: "queued",
    resume: 1,
    resume_message: text,
    pending_question: null,
    last_error: null,
  });
  tick();
  return pt
    ? `▶️ Resposta enviada ao agente ${run.agent_name} (card #${run.card_number ?? "?"}) — retomando.`
    : `▶️ Answer sent to agent ${run.agent_name} (card #${run.card_number ?? "?"}) — resuming.`;
}

async function processMessage(tg, msg) {
  if (String(msg.chat?.id) !== String(tg.chatId)) return;
  const text = msg.text?.trim();
  if (!text) return;
  const pt = getLanguage() === "pt";

  let runId = parseRunRef(msg.reply_to_message?.text);
  let reply;
  if (!runId) {
    const waiting = listRuns().filter(
      (r) => r.status === "waiting-input" || r.status === "waiting-approval",
    );
    if (waiting.length === 1) {
      runId = waiting[0].id;
    } else {
      reply = waiting.length === 0
        ? pt ? "Nenhum agente aguardando entrada no momento." : "No agent is awaiting input right now."
        : pt
          ? "Mais de um agente aguardando — responda (reply) diretamente à mensagem do card correspondente."
          : "More than one agent is waiting — reply directly to the corresponding card message.";
    }
  }
  if (runId) reply = actOnRun(runId, text, pt);
  await api(tg.botToken, "sendMessage", { chat_id: msg.chat.id, text: reply });
}

export function startTelegramPolling() {
  if (started) return;
  started = true;
  (async () => {
    // offset confirma os updates já processados. Sem persistência: updates não
    // confirmados são re-entregues pelo Telegram no próximo boot.
    let offset = 0;
    for (;;) {
      try {
        const tg = getConfig().integrations?.telegram;
        if (suspended || !tg?.enabled || !tg.botToken || !tg.chatId) {
          await sleep(5_000);
          continue;
        }
        abortCtl = new AbortController();
        const updates = await api(
          tg.botToken,
          "getUpdates",
          { timeout: 50, offset, allowed_updates: ["message"] },
          abortCtl.signal,
        );
        for (const u of updates) {
          offset = u.update_id + 1;
          const msg = u.message;
          // Ignora mensagens antigas (ex.: enviadas com o servidor desligado há
          // muito tempo) para não reprocessar histórico após um restart.
          if (!msg || msg.date * 1000 < Date.now() - 5 * 60_000) continue;
          await processMessage(tg, msg).catch((err) =>
            console.error("[telegram] processMessage:", err.message),
          );
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("[telegram] poll:", err.message);
          await sleep(10_000);
        }
      }
    }
  })();
}
