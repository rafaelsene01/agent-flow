"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, ScrollText, ArrowLeft, Send, CornerDownRight, User } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import LogView from "@/components/board/LogView.jsx";
import { useI18n } from "@/lib/i18nContext";
import { useToast } from "@/lib/toast";
import { collapseLogLines } from "@/lib/logFormat";

// Em dev conecta direto no backend (5522) para evitar o buffering do proxy
// do next dev, que segura o stream SSE. Em produção é mesma origem.
const SSE_BASE = process.env.NODE_ENV === "development" ? "http://localhost:5522" : "";

const STATUS_CLASS = {
  queued: "",
  processing: "border-blue-400 text-blue-600 dark:text-blue-400",
  "waiting-input": "border-amber-400 text-amber-600 dark:text-amber-400",
  done: "border-emerald-400 text-emerald-600 dark:text-emerald-400",
  error: "",
};

function StatusBadge({ status }) {
  const { t } = useI18n();
  return (
    <Badge variant={status === "error" ? "destructive" : "outline"} className={STATUS_CLASS[status] ?? ""}>
      {t(`running.status.${status}`)}
    </Badge>
  );
}

function parseTurns(run) {
  if (!run?.turns) return [];
  try {
    const t = JSON.parse(run.turns);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

// Sobreposição com o log de UM segmento de execução. Fechar volta para o chat.
// `segment`: { runId, agentName, logFile, isActive, status }
function RunLogOverlay({ segment, onClose }) {
  const { t } = useI18n();
  const [logText, setLogText] = useState("");
  const loadedStatic = useRef(false);
  const { runId, isActive, logFile } = segment;

  useEffect(() => {
    if (isActive || loadedStatic.current) return;
    loadedStatic.current = true;
    const qs = logFile ? `?file=${encodeURIComponent(logFile)}` : "";
    fetch(`/api/agent-runs/${encodeURIComponent(runId)}/log${qs}`)
      .then((r) => r.json())
      .then((d) => setLogText(d.content ?? ""))
      .catch(() => {});
  }, [isActive, runId, logFile]);

  useEffect(() => {
    if (!isActive) return;
    setLogText("");
    loadedStatic.current = false;
    const es = new EventSource(`${SSE_BASE}/api/agent-runs/${encodeURIComponent(runId)}/log/stream`);
    es.onmessage = (e) => setLogText((prev) => prev + e.data + "\n");
    es.addEventListener("done", () => es.close());
    return () => es.close();
  }, [isActive, runId]);

  const display = useMemo(() => collapseLogLines(logText), [logText]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClose} aria-label={t("running.chat.back")}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{segment.agentName}</span>
        {isActive && <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />}
        {segment.status && <StatusBadge status={segment.status} />}
      </div>
      <div className="flex-1 overflow-y-auto bg-zinc-950 px-4 py-3">
        {display ? <LogView text={display} /> : <p className="text-xs text-zinc-500">{t("running.noLog")}</p>}
      </div>
    </div>
  );
}

// Bloco de log (segmento de execução) dentro da timeline do chat.
function ExecBlock({ label, status, active, onOpen }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
    >
      <ScrollText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-xs font-medium">{label}</span>
      {active && <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-500" />}
      {status && <StatusBadge status={status} />}
      <span className="text-[11px] text-muted-foreground">{t("running.chat.viewLog")}</span>
    </button>
  );
}

// Um bloco do chat = uma execução (run) da pipeline, renderizada como uma
// conversa (timeline de turns: exec / question / answer).
function RunChatCard({ run, index, onOpenLog, onSend, sending }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  const isActive = run.status === "processing";
  const isQueued = run.status === "queued";
  const isWaiting = run.status === "waiting-input";

  const turns = parseTurns(run);
  // Alternativas da última pergunta (para os "chips" que caem no input).
  const lastQuestion = [...turns].reverse().find((tn) => tn.type === "question");
  const options = isWaiting ? (lastQuestion?.options ?? []) : [];

  // Preenche o input com a alternativa escolhida (mesmo comportamento da criação de skill).
  function pickOption(opt) {
    setDraft((d) => (d.trim() ? `${d.trim()} ${opt}` : opt));
  }

  async function submit() {
    if (!draft.trim() || sending) return;
    const ok = await onSend(run, draft.trim());
    if (ok) setDraft("");
  }

  let execCount = 0;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-3.5">
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{run.agent_name}</span>
        {isActive && <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-500" />}
        <StatusBadge status={run.status} />
      </div>

      {isQueued && (
        <p className="text-[11px] italic text-muted-foreground">
          {run.depends_on ? t("running.chat.waitingPrev") : t("running.chat.queued")}
        </p>
      )}

      {/* Timeline em camadas: cada segmento de execução vira um bloco de log; as
          perguntas e respostas aparecem como balões de chat entre eles. */}
      {turns.length > 0 ? (
        <div className="flex flex-col gap-2">
          {turns.map((tn, i) => {
            if (tn.type === "exec") {
              execCount += 1;
              const n = execCount;
              const active = isActive && tn.logFile === run.log_file;
              return (
                <ExecBlock
                  key={i}
                  label={`${t("running.chat.execution")} ${n}`}
                  status={active ? undefined : tn.status}
                  active={active}
                  onOpen={() =>
                    onOpenLog({
                      runId: run.id,
                      agentName: run.agent_name,
                      logFile: tn.logFile,
                      isActive: active,
                      status: tn.status,
                    })
                  }
                />
              );
            }
            if (tn.type === "question") {
              return (
                <div key={i} className="flex items-start gap-1.5 rounded-lg border bg-muted/40 px-3 py-2">
                  <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                  <p className="whitespace-pre-wrap break-words text-xs text-foreground">{tn.text}</p>
                </div>
              );
            }
            if (tn.type === "answer") {
              return (
                <div key={i} className="ml-auto flex max-w-[85%] items-start gap-1.5">
                  <div className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground whitespace-pre-wrap break-words">
                    {tn.text}
                  </div>
                  <User className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                </div>
              );
            }
            return null;
          })}
        </div>
      ) : (
        // Fallback p/ runs antigos sem timeline
        <button
          type="button"
          onClick={() => onOpenLog({ runId: run.id, agentName: run.agent_name, logFile: run.log_file, isActive, status: run.status })}
          className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ScrollText className="size-3.5" />
          {t("running.chat.viewLog")}
        </button>
      )}

      {run.status === "error" && run.last_error && (
        <p className="whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">
          {run.last_error}
        </p>
      )}

      {/* Input de resposta (quando aguardando input) + alternativas selecionáveis */}
      {isWaiting && (
        <div className="flex flex-col gap-2">
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickOption(opt)}
                  disabled={sending}
                  className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-50"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("running.answerPlaceholder")}
              className="min-h-14 flex-1 text-sm"
            />
            <Button size="sm" disabled={sending || !draft.trim()} onClick={submit}>
              <Send className="size-3.5" />
              {t("running.sendContinue")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Modal de "chat" de uma pipeline: um bloco por execução (run), cada um com uma
 * timeline em camadas (segmentos de log + perguntas + respostas). A resposta é
 * enfileirada (o agente retoma quando estiver livre).
 */
export default function RunModal({ runId, onClose }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [chain, setChain] = useState(null); // array de runs | null=carregando
  const [openLog, setOpenLog] = useState(null); // segmento aberto | null
  const [sendingId, setSendingId] = useState(null);

  function load() {
    fetch(`/api/agent-runs/${encodeURIComponent(runId)}/chain`)
      .then((r) => r.json())
      .then((d) => setChain(d.runs ?? []))
      .catch(() => setChain((prev) => prev ?? []));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 2500);
    return () => clearInterval(interval);
  }, [runId]);

  async function handleSend(run, message) {
    setSendingId(run.id);
    try {
      const res = await fetch(`/api/agent-runs/${encodeURIComponent(run.id)}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      load();
      return true;
    } catch (err) {
      toast({ title: err.message || t("running.sendError"), variant: "error" });
      return false;
    } finally {
      setSendingId(null);
    }
  }

  const head = chain?.[0];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex h-[85vh] w-full max-w-6xl sm:max-w-6xl flex-col overflow-hidden p-0 gap-0"
      >
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">
              {head?.card_title || head?.repo || "…"}
            </DialogTitle>
            <p className="truncate text-xs text-muted-foreground">
              {head?.repo}
              {head?.card_number != null ? ` · #${head.card_number}` : ""}
              {head?.target_branch ? ` · ${head.target_branch}` : ""}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClose} aria-label={t("running.close")}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {chain === null ? (
            <div className="flex flex-1 items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : chain.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("running.empty")}</p>
          ) : (
            chain.map((r, i) => (
              <RunChatCard
                key={r.id}
                run={r}
                index={i}
                onOpenLog={setOpenLog}
                onSend={handleSend}
                sending={sendingId === r.id}
              />
            ))
          )}
        </div>

        {openLog && <RunLogOverlay segment={openLog} onClose={() => setOpenLog(null)} />}
      </DialogContent>
    </Dialog>
  );
}
