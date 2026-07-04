"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { X, Loader2, ScrollText, ArrowLeft, Send, CornerDownRight, User, Hand, CheckCircle2, Bot, Copy, Check } from "lucide-react";
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
  "waiting-approval": "border-amber-400 text-amber-600 dark:text-amber-400",
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
  const scrollRef = useRef(null);
  // Auto-scroll ("seguir o fim"): ativo ao abrir o overlay e enquanto o usuário
  // estiver no fim do log; scroll para cima desativa, voltar ao fim reativa.
  const followRef = useRef(true);
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

  // A cada conteúdo novo (carga inicial ou linha do SSE), rola até o fim se o
  // follow estiver ativo. O scroll programático dispara onScroll, que recalcula
  // o follow como "no fim" — então ele permanece ativo.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [display]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // Margem de 16px: considera "no fim" mesmo com arredondamento subpixel.
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
  }

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
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-zinc-950 px-4 py-3">
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

// Resposta final do agente (ex.: a descrição gerada), renderizada como markdown.
// O botão copia o markdown BRUTO — pronto para colar de volta no card.
function ResultBlock({ text }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative rounded-lg border bg-muted/20 px-3 py-2.5">
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "absolute right-2 top-2 z-[1] flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur transition hover:text-foreground",
          copied && "border-emerald-400/50 text-emerald-600 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400",
        )}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? t("running.chat.copied") : t("running.chat.copy")}
      </button>
      <div className="flex items-start gap-1.5">
        <Bot className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="prose prose-sm dark:prose-invert min-w-0 max-w-none flex-1 break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, { detect: false }]]}
          >
            {text}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

// Ponto de parada na pipeline: não roda no Claude, só destrava o próximo passo
// quando o usuário aprova. Enquanto o passo anterior não conclui, fica na fila.
function BreakpointCard({ run, onApprove, approving }) {
  const { t } = useI18n();
  const isWaiting = run.status === "waiting-approval";
  const isDone = run.status === "done";

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-amber-400/50 bg-amber-50/40 p-3.5 dark:bg-amber-950/10">
      <div className="flex items-center gap-2">
        <Hand className="size-3.5 shrink-0 text-amber-500" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t("running.launch.breakpoint")}</span>
        <StatusBadge status={run.status} />
      </div>

      {run.status === "queued" && (
        <p className="text-[11px] italic text-muted-foreground">{t("running.chat.waitingPrev")}</p>
      )}
      {isDone && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" />
          {t("running.breakpoint.released")}
        </p>
      )}
      {isWaiting && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t("running.breakpoint.waitingHint")}</p>
          <Button size="sm" className="w-fit" disabled={approving} onClick={() => onApprove(run)}>
            {approving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            {t("running.breakpoint.approve")}
          </Button>
        </div>
      )}
    </div>
  );
}

// O chat de uma sessão de agente, renderizado como uma conversa
// (timeline de turns: exec / question / answer / result).
function RunChatCard({ run, onOpenLog, onSend, sending }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  const isActive = run.status === "processing";
  const isQueued = run.status === "queued";
  const isWaiting = run.status === "waiting-input";
  // Input liberado sempre que o agente não está processando nem na fila: além de
  // responder perguntas (waiting-input), o usuário pode pedir ajustes ao resultado
  // de um run concluído — a mensagem retoma a mesma sessão do Claude.
  const canSend = !isActive && !isQueued;

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
        <Bot className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{run.agent_name}</span>
        {isActive && <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-500" />}
        <StatusBadge status={run.status} />
      </div>

      {isQueued && (
        <p className="text-[11px] italic text-muted-foreground">
          {/* Run retomado (resume=1) já rodou antes: está só aguardando vez na fila. */}
          {run.depends_on && !run.resume ? t("running.chat.waitingPrev") : t("running.chat.queued")}
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
            if (tn.type === "result") {
              return <ResultBlock key={i} text={tn.text} />;
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

      {/* Input da sessão: responde a pergunta pendente (waiting-input) ou pede um
          ajuste ao resultado — disponível sempre que o agente não está processando. */}
      {canSend && (
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
              placeholder={t(isWaiting ? "running.answerPlaceholder" : "running.messagePlaceholder")}
              className="min-h-14 flex-1 text-sm"
            />
            <Button size="sm" disabled={sending || !draft.trim()} onClick={submit}>
              <Send className="size-3.5" />
              {t(isWaiting ? "running.sendContinue" : "running.send")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Modal de "chat" de UMA sessão de agente (um run): timeline em camadas
 * (segmentos de log + perguntas + respostas + resultado em markdown). A mensagem
 * do usuário é enfileirada e retoma a mesma sessão quando o agente estiver livre.
 */
export default function RunModal({ runId, onClose }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [run, setRun] = useState(null); // run | null=carregando
  const [openLog, setOpenLog] = useState(null); // segmento aberto | null
  const [sendingId, setSendingId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  function load() {
    fetch(`/api/agent-runs/${encodeURIComponent(runId)}`)
      .then((r) => r.json())
      .then((d) => setRun(d.run ?? null))
      .catch(() => setRun((prev) => prev ?? null));
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

  async function handleApprove(run) {
    setApprovingId(run.id);
    try {
      const res = await fetch(`/api/agent-runs/${encodeURIComponent(run.id)}/approve`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      load();
    } catch (err) {
      toast({ title: err.message || t("running.sendError"), variant: "error" });
    } finally {
      setApprovingId(null);
    }
  }

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
              {run ? `${run.agent_name} · ${run.card_title || run.repo}` : "…"}
            </DialogTitle>
            <p className="truncate text-xs text-muted-foreground">
              {run?.repo}
              {run?.card_number != null ? ` · #${run.card_number}` : ""}
              {run?.target_branch ? ` · ${run.target_branch}` : ""}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClose} aria-label={t("running.close")}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {run === null ? (
            <div className="flex flex-1 items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : run.kind === "breakpoint" ? (
            <BreakpointCard
              run={run}
              onApprove={handleApprove}
              approving={approvingId === run.id}
            />
          ) : (
            <RunChatCard
              run={run}
              onOpenLog={setOpenLog}
              onSend={handleSend}
              sending={sendingId === run.id}
            />
          )}
        </div>

        {openLog && <RunLogOverlay segment={openLog} onClose={() => setOpenLog(null)} />}
      </DialogContent>
    </Dialog>
  );
}
