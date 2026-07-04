"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import {
  Archive,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  Loader2,
  MessageCircleQuestion,
  Rocket,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import CreateBranchModal from "@/components/CreateBranchModal.jsx";
import EnqueueAgentModal from "@/components/running/EnqueueAgentModal.jsx";
import RunModal from "@/components/running/RunModal.jsx";
import CopyCmd from "@/components/board/CopyCmd.jsx";
import FileContentModal from "@/components/board/FileContentModal.jsx";
import LogView from "@/components/board/LogView.jsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { Separator } from "@/components/ui/separator.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs.jsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.jsx";
import { cn } from "@/lib/utils";
import { collapseLogLines } from "@/lib/logFormat";
import { statusColor, statusLabel, fileIcon } from "@/lib/fileVisuals";
import { useToast } from "@/lib/toast";
import { useI18n } from "@/lib/i18nContext";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";

const TYPE_LABEL = {
  Issue: "Issue",
  PullRequest: "Pull request",
  DraftIssue: "Draft issue",
};

const ORIGIN_LABEL = {
  task: "tarefa",
  spec: "spec",
  eval: "eval",
  tlc: "tlc",
  chat: "chat",
  agent: "agente",
  "create-pr": "PR",
};

// Cores do "pill" de status dos agent-runs listados no card.
const RUN_STATUS_PILL = {
  queued: "border-border text-muted-foreground",
  processing: "border-blue-400/50 text-blue-600 dark:text-blue-400",
  "waiting-input": "border-amber-400/60 text-amber-600 dark:text-amber-400",
  done: "border-emerald-400/50 text-emerald-600 dark:text-emerald-400",
  error: "border-destructive/50 text-destructive",
};

function Assignee({ login, avatarUrl, size = "size-6" }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div
      title={`@${login}`}
      className={`${size} rounded-full border-2 border-background overflow-hidden bg-muted flex items-center justify-center shrink-0`}
    >
      {avatarUrl && !imgFailed ? (
        <img
          src={avatarUrl}
          alt={login}
          className="size-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="text-xs font-semibold uppercase text-muted-foreground leading-none">
          {login[0]}
        </span>
      )}
    </div>
  );
}

function SidebarLabel({ children }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function CardRunsList({ runs, onOpen }) {
  const { t } = useI18n();
  if (!Array.isArray(runs) || runs.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {runs.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onOpen(r.id)}
          className={cn(
            "flex items-center gap-2 rounded-lg border bg-card/50 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/40",
            r.status === "waiting-input" &&
              "border-amber-400/60 bg-amber-500/[0.06]",
          )}
        >
          {r.status === "processing" && (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-500" />
          )}
          {r.status === "waiting-input" && (
            <MessageCircleQuestion className="size-3.5 shrink-0 text-amber-500" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {r.agent_name}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              RUN_STATUS_PILL[r.status] ?? "text-muted-foreground",
            )}
          >
            {t(`running.status.${r.status}`)}
          </span>
        </button>
      ))}
    </div>
  );
}

function AdvancedGitSection({ branch }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <CollapsiblePrimitive.Root open={open} onOpenChange={setOpen}>
      <CollapsiblePrimitive.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>{open ? "▾" : "▸"}</span>
          <span>{t("git.advanced")}</span>
        </button>
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content>
        <div className="flex flex-col gap-1 mt-0.5 pl-2 border-l border-destructive/30">
          <span className="text-xs text-destructive/70 uppercase tracking-wide">
            {t("git.advanced.desc")}
          </span>
          <CopyCmd cmd={`git reset --hard origin/${branch}`} />
          <CopyCmd cmd="git reset --soft HEAD~1" />
          <CopyCmd cmd="git restore --staged ." />
          <CopyCmd cmd={`git push --force-with-lease origin ${branch}`} />
        </div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}

export default function CardModal({ item, board, onClose, onWorktreeChange }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [showEnqueueAgent, setShowEnqueueAgent] = useState(false);
  const [cardRuns, setCardRuns] = useState(null); // null=loading, array=loaded (agent-runs deste card)
  const [openRunId, setOpenRunId] = useState(null); // run cujo chat está aberto
  const [worktreeConfig, setWorktreeConfig] = useState(null); // null=loading false=none object=found

  const worktreeId =
    board?.originRepo && item.number != null
      ? `${board.originRepo}#${item.number}`
      : null;

  function loadWorktreeConfig() {
    if (!worktreeId) {
      setWorktreeConfig(false);
      return;
    }
    fetch("/api/config/worktrees")
      .then((r) => r.json())
      .then((list) =>
        setWorktreeConfig(list.find((w) => w.id === worktreeId) ?? false),
      )
      .catch(() => setWorktreeConfig(false));
  }

  useEffect(loadWorktreeConfig, [worktreeId]);

  // Agent-runs (fila) relacionados a este card. Poll enquanto o card está aberto
  // para refletir mudanças de status (ex.: um run que passa a aguardar resposta).
  function loadCardRuns() {
    if (!board?.originRepo || item.number == null) {
      setCardRuns([]);
      return;
    }
    const qs = new URLSearchParams({
      repo: board.originRepo,
      card: String(item.number),
    });
    fetch(`/api/agent-runs?${qs}`)
      .then((r) => r.json())
      .then((d) => setCardRuns(d.runs ?? []))
      .catch(() => setCardRuns((prev) => prev ?? []));
  }

  useEffect(() => {
    loadCardRuns();
    const timer = setInterval(loadCardRuns, 3000);
    return () => clearInterval(timer);
  }, [board?.originRepo, item.number]); // eslint-disable-line react-hooks/exhaustive-deps

  const isConfigured = !!worktreeConfig;
  const isChecking = worktreeConfig === null && worktreeId !== null;

  const [changedFiles, setChangedFiles] = useState(null); // null=not loaded, array=loaded
  const [fileContentModal, setFileContentModal] = useState(null); // null | file path string
  const [pullBehind, setPullBehind] = useState(null); // null=not checked, number=count
  const [pullSending, setPullSending] = useState(false);
  const [helpersFiles, setHelpersFiles] = useState(null); // null=not loaded, array=loaded
  const [helpersFileModal, setHelpersFileModal] = useState(null); // null | file path string
  const [logText, setLogText] = useState("");
  const [mainTab, setMainTab] = useState("desc");
  const [messageText, setMessageText] = useState("");
  const [messageModel, setMessageModel] = useState("sonnet");
  const [messageEffort, setMessageEffort] = useState("medium");
  const [messageSending, setMessageSending] = useState(false);
  const [resetWorktreeSending, setResetWorktreeSending] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("__new__");
  const logRef = useRef(null);
  const prevAnyRunningRef = useRef(null);

  function loadChangedFiles() {
    if (!worktreeId) return;
    setChangedFiles(null);
    fetch(
      `/api/config/worktrees/${encodeURIComponent(worktreeId)}/changed-files`,
    )
      .then((r) => r.json())
      .then((d) => setChangedFiles(d.files ?? []))
      .catch(() => setChangedFiles([]));
  }

  async function handleExcludeFile(filePath) {
    try {
      await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/file?file=${encodeURIComponent(filePath)}`,
        { method: "DELETE" },
      );
      loadChangedFiles();
      toast({ title: t("toast.exclude.success"), variant: "success" });
    } catch (err) {
      console.error("[exclude-file]", err);
      toast({
        title: t("toast.exclude.error"),
        description: err.message,
        variant: "error",
      });
    }
  }

  function loadBehindCount() {
    if (!worktreeId) return;
    setPullBehind(null);
    fetch(
      `/api/config/worktrees/${encodeURIComponent(worktreeId)}/behind-count`,
    )
      .then((r) => r.json())
      .then((d) => setPullBehind(d.behind ?? 0))
      .catch(() => setPullBehind(0));
  }

  function loadHelpersFiles() {
    if (!worktreeId) return;
    setHelpersFiles(null);
    fetch(
      `/api/config/worktrees/${encodeURIComponent(worktreeId)}/helpers-files`,
    )
      .then((r) => r.json())
      .then((d) => setHelpersFiles(d.files ?? []))
      .catch(() => setHelpersFiles([]));
  }

  async function handlePull() {
    setPullSending(true);
    try {
      await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/pull`,
        { method: "POST" },
      );
      loadWorktreeConfig();
      loadBehindCount();
      toast({ title: t("toast.pull.success"), variant: "success" });
    } catch (err) {
      console.error("[pull]", err);
      toast({
        title: t("toast.pull.error"),
        description: err.message,
        variant: "error",
      });
    } finally {
      setPullSending(false);
    }
  }

  useEffect(() => {
    if (worktreeConfig?.pullStatus === "done") {
      loadBehindCount();
      loadChangedFiles();
    }
  }, [worktreeConfig?.pullStatus]);

  const anyRunning =
    worktreeConfig?.pullStatus === "running" ||
    worktreeConfig?.messageStatus === "running";

  // Modais Radix aninhados dentro deste card. Ao fechar qualquer um deles, o
  // FocusScope restaura o foco e dispara um evento de "focus outside" residual
  // na camada de dismissal do card — o que fechava o card junto. O ref abaixo
  // mantém o guard ativo durante (e por um tick após) um filho estar aberto,
  // absorvendo esse evento residual independentemente da corrida de estado.
  const childModalOpen =
    !!fileContentModal ||
    !!helpersFileModal ||
    showCreateBranch ||
    showEnqueueAgent ||
    !!openRunId;
  const childModalGuardRef = useRef(false);
  useEffect(() => {
    if (childModalOpen) {
      childModalGuardRef.current = true;
      return undefined;
    }
    const id = setTimeout(() => {
      childModalGuardRef.current = false;
    }, 0);
    return () => clearTimeout(id);
  }, [childModalOpen]);

  // Ao abrir o card sem run ativo: carrega log da última sessão do disco
  useEffect(() => {
    if (!worktreeId || !isConfigured || anyRunning) return;
    const sessions = (worktreeConfig?.chatSessions ?? [])
      .filter((s) => s.started && s.logFile)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const last = sessions[0];
    if (!last) return;
    fetch(
      `/api/config/worktrees/${encodeURIComponent(worktreeId)}/helpers-file?file=${encodeURIComponent(last.logFile)}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.content) setLogText(d.content);
      })
      .catch(() => {});
  }, [worktreeId, isConfigured]); // eslint-disable-line react-hooks/exhaustive-deps

  // Conecta SSE apenas quando há run ativo (na abertura ou quando um novo run inicia)
  useEffect(() => {
    if (!worktreeId || !isConfigured) return;

    const wasRunning = prevAnyRunningRef.current;
    prevAnyRunningRef.current = anyRunning;

    const newRunStarted = anyRunning && !wasRunning;

    // Na primeira abertura sem run ativo: não conecta SSE (log vem do disco acima)
    if (wasRunning === null && !anyRunning) return;
    // Depois da primeira abertura: só reconecta quando um novo run inicia
    if (wasRunning !== null && !newRunStarted) return;

    setLogText("");

    // Em dev conecta direto no backend (5522) para evitar o buffering do proxy
    // do next dev, que segura o stream SSE. Em produção é mesma origem.
    const base =
      process.env.NODE_ENV === "development" ? "http://localhost:5522" : "";
    const es = new EventSource(
      `${base}/api/config/worktrees/${encodeURIComponent(worktreeId)}/log/stream`,
    );
    es.onmessage = (e) => {
      setLogText((prev) => prev + e.data + "\n");
    };
    es.addEventListener("done", () => es.close());
    return () => es.close();
  }, [isConfigured, worktreeId, anyRunning]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logText]);

  useEffect(() => {
    if (logText) setMainTab((t) => (t === "desc" ? "logs" : t));
  }, [!!logText]);

  // Poll while any background job is running
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(loadWorktreeConfig, 3000);
    return () => clearInterval(timer);
  }, [worktreeConfig?.pullStatus, worktreeConfig?.messageStatus]);

  async function handleSendMessage() {
    const text = messageText.trim();
    if (!text) return;
    setMessageSending(true);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            model: messageModel,
            effort: messageEffort,
            sessionId:
              selectedSessionId === "__new__" ? undefined : selectedSessionId,
          }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessageText("");
      if (data.sessionId) setSelectedSessionId(data.sessionId);
      loadWorktreeConfig();
      onWorktreeChange?.();
      toast({ title: t("toast.send.success"), variant: "success" });
    } catch (err) {
      console.error("[send-message]", err);
      toast({
        title: t("toast.send.error"),
        description: err.message,
        variant: "error",
      });
    } finally {
      setMessageSending(false);
    }
  }

  async function handleResetWorktree() {
    if (!worktreeId) return;
    setResetWorktreeSending(true);
    try {
      await fetch(`/api/config/worktrees/${encodeURIComponent(worktreeId)}`, {
        method: "DELETE",
      });
      loadWorktreeConfig();
      onWorktreeChange?.();
      toast({ title: t("toast.reset.success"), variant: "success" });
    } catch (err) {
      console.error("[reset-worktree]", err);
      toast({
        title: t("toast.reset.error"),
        description: err.message,
        variant: "error",
      });
    } finally {
      setResetWorktreeSending(false);
    }
  }

  const displayLogText = useMemo(() => collapseLogLines(logText), [logText]);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !childModalOpen && !childModalGuardRef.current) {
          onClose();
        }
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        onInteractOutside={(e) => {
          if (anyRunning || childModalOpen || childModalGuardRef.current)
            e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (anyRunning || childModalOpen || childModalGuardRef.current)
            e.preventDefault();
        }}
        className="w-full sm:max-w-[calc(100%-2rem)] h-[80vh] gap-0 overflow-hidden p-0"
      >
        <div className="flex h-full min-h-0">
          {/* ── main ── */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-col gap-2.5 px-6 pt-5 pb-3">
              <div className="flex items-center justify-between">
                {item.number != null ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    #{item.number}
                  </span>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  {item.assignees?.length > 0 && (
                    <div className="flex items-center -space-x-1.5">
                      {item.assignees.map((a) => {
                        const login = typeof a === "string" ? a : a?.login;
                        const avatarUrl =
                          typeof a === "string" ? null : a?.avatarUrl;
                        if (!login) return null;
                        return (
                          <Assignee
                            key={login}
                            login={login}
                            avatarUrl={avatarUrl}
                            size="size-6"
                          />
                        );
                      })}
                    </div>
                  )}
                  {item.labels?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {item.labels.map((l) => (
                        <span
                          key={l.name}
                          className="rounded-full border px-2 py-px text-[11px]"
                          style={{
                            background: `#${l.color}22`,
                            color: `#${l.color}`,
                            borderColor: `#${l.color}55`,
                          }}
                        >
                          {l.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogTitle className="text-xl font-semibold leading-snug">
                {item.title}
              </DialogTitle>
              <Separator />
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setMainTab("desc")}
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-wider transition-colors rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mainTab === "desc"
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("card.description")}
                </button>
                {logText && (
                  <button
                    type="button"
                    onClick={() => setMainTab("logs")}
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      mainTab === "logs"
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t("card.logs")}
                    {anyRunning && (
                      <span className="inline-block size-1.5 rounded-full bg-green-500 animate-pulse" />
                    )}
                  </button>
                )}
              </div>
            </div>
            {mainTab === "logs" && logText ? (
              <div
                ref={logRef}
                className="min-h-0 flex-1 overflow-y-auto bg-zinc-950 px-4 py-3"
              >
                <LogView text={displayLogText} />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
                {item.body ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[[rehypeHighlight, { detect: false }]]}
                    >
                      {item.body}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    Sem descrição.
                  </p>
                )}
              </div>
            )}

            {/* ── campo fixo de mensagem ── */}
            {isConfigured && (
              <div className="shrink-0 border-t bg-muted/20 px-6 py-3">
                <div className="mb-2">
                  <Select
                    value={selectedSessionId}
                    onValueChange={setSelectedSessionId}
                    disabled={anyRunning || messageSending}
                  >
                    <SelectTrigger size="sm" className="text-xs w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">
                        {t("card.session.new")}
                      </SelectItem>
                      {[...(worktreeConfig?.chatSessions ?? [])]
                        .sort(
                          (a, b) =>
                            new Date(b.createdAt) - new Date(a.createdAt),
                        )
                        .map((s) => (
                          <SelectItem
                            key={s.id}
                            value={s.id}
                            title={s.description}
                          >
                            [{ORIGIN_LABEL[s.origin] ?? s.origin}]{" "}
                            {s.description}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      if (!anyRunning && !messageSending) handleSendMessage();
                    }
                  }}
                  placeholder={t("card.message.placeholder")}
                  className="min-h-16 resize-none text-sm"
                  disabled={anyRunning || messageSending}
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Select
                      value={messageModel}
                      onValueChange={setMessageModel}
                      disabled={anyRunning || messageSending}
                    >
                      <SelectTrigger
                        size="sm"
                        className="text-xs"
                        title="Model"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="haiku">Haiku</SelectItem>
                        <SelectItem value="sonnet">Sonnet</SelectItem>
                        <SelectItem value="opus">Opus</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={messageEffort}
                      onValueChange={setMessageEffort}
                      disabled={anyRunning || messageSending}
                    >
                      <SelectTrigger
                        size="sm"
                        className="text-xs"
                        title="Effort"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">low</SelectItem>
                        <SelectItem value="medium">medium</SelectItem>
                        <SelectItem value="high">high</SelectItem>
                        <SelectItem value="xhigh">xhigh</SelectItem>
                        <SelectItem value="max">max</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground select-none">
                      ⌘↵
                    </span>
                    <Button
                      size="sm"
                      type="button"
                      className="gap-2"
                      disabled={
                        !messageText.trim() || anyRunning || messageSending
                      }
                      onClick={handleSendMessage}
                    >
                      {messageSending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                      <span>{t("action.send")}</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── sidebar ── */}
          <aside className="flex w-[280px] shrink-0 flex-col gap-5 overflow-y-auto border-l bg-muted/30 p-5">
            <div className="flex flex-col gap-2">
              <SidebarLabel>{t("card.triggers")}</SidebarLabel>
              <div className="flex flex-col gap-1.5">
                {/* ── Configurar Branch (inalterado) ── */}
                <div className="flex gap-1.5">
                  <Button
                    variant={!isConfigured ? "default" : "outline"}
                    size="sm"
                    type="button"
                    disabled={isConfigured || isChecking}
                    onClick={() => setShowCreateBranch(true)}
                    className={cn(
                      "flex-1 justify-start gap-2 text-xs",
                      isConfigured &&
                        "border-state-completed/50 text-state-completed opacity-75",
                    )}
                  >
                    <GitBranch className="size-3.5" />
                    <span>Configurar Branch</span>
                  </Button>
                  {isConfigured && (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      type="button"
                      title="Resetar: remove a worktree do disco e limpa a configuração do card"
                      onClick={handleResetWorktree}
                      disabled={resetWorktreeSending}
                    >
                      {resetWorktreeSending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                    </Button>
                  )}
                </div>

                {isConfigured && (
                  <>
                    <div className="flex flex-col rounded-lg border bg-muted/50 px-2.5 py-1.5">
                      <span className="flex items-center gap-1 text-xs font-semibold">
                        <GitBranch className="size-3 shrink-0" />
                        {worktreeConfig.branch}
                      </span>
                      <span
                        className="truncate font-mono text-[11px] text-muted-foreground"
                        title={worktreeConfig.path}
                      >
                        {worktreeConfig.path
                          .split(/[\\/]/)
                          .filter(Boolean)
                          .pop()}
                      </span>
                    </div>
                    <CopyCmd cmd={`cd ${worktreeConfig.path}`} />
                  </>
                )}

                {/* ── Abas (só quando configurado) ── */}
                {isConfigured && (
                  <Tabs
                    defaultValue="exec"
                    onValueChange={(val) => {
                      if (val === "files") loadChangedFiles();
                      if (val === "git") loadBehindCount();
                      if (val === "helpers") loadHelpersFiles();
                    }}
                    className="w-full mt-1"
                  >
                    <TooltipProvider>
                      <TabsList className="w-full grid grid-cols-4 h-8">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TabsTrigger value="exec" className="px-0">
                              <Rocket className="size-3.5" />
                            </TabsTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {t("card.executors")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TabsTrigger value="git" className="px-0">
                              <GitBranch className="size-3.5" />
                            </TabsTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {t("card.git")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TabsTrigger value="files" className="px-0">
                              <FolderOpen className="size-3.5" />
                            </TabsTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {t("card.files")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TabsTrigger value="helpers" className="px-0">
                              <Archive className="size-3.5" />
                            </TabsTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {t("card.helpers")}
                          </TooltipContent>
                        </Tooltip>
                      </TabsList>
                    </TooltipProvider>

                    {/* ── Aba 1: Executores (fila de agentes) ── */}
                    <TabsContent
                      value="exec"
                      className="flex flex-col gap-1.5 mt-2"
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setShowEnqueueAgent(true)}
                        className="w-full justify-start gap-2 text-xs"
                      >
                        <Rocket className="size-3.5" />
                        <span>{t("running.launch.button")}</span>
                      </Button>
                      {Array.isArray(cardRuns) && cardRuns.length > 0 && (
                        <>
                          <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            {t("running.card.title")}
                          </span>
                          <CardRunsList runs={cardRuns} onOpen={setOpenRunId} />
                        </>
                      )}
                    </TabsContent>

                    {/* ── Aba 2: Git ── */}
                    <TabsContent
                      value="git"
                      className="flex flex-col gap-1.5 mt-2"
                    >
                      {/* Pull */}
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={
                          pullBehind === null ||
                          pullBehind === 0 ||
                          pullSending ||
                          worktreeConfig?.pullStatus === "running"
                        }
                        onClick={handlePull}
                        className="w-full justify-start gap-2 text-xs"
                      >
                        <GitPullRequest className="size-3.5" />
                        <span>
                          {pullSending ||
                          worktreeConfig?.pullStatus === "running"
                            ? "Sincronizando…"
                            : pullBehind === null
                              ? "Verificando…"
                              : pullBehind > 0
                                ? `Pull (${pullBehind} commit${pullBehind > 1 ? "s" : ""})`
                                : "Pull (atualizado)"}
                        </span>
                        {(pullSending ||
                          worktreeConfig?.pullStatus === "running") && (
                          <Loader2 className="ml-auto size-3 animate-spin" />
                        )}
                      </Button>

                      <div className="flex flex-col gap-1 mt-0.5">
                        <CopyCmd
                          cmd={`git checkout ${worktreeConfig.branch}`}
                        />
                        <CopyCmd cmd={`git fetch origin`} />
                        <CopyCmd cmd="git add ." />
                        <CopyCmd cmd='git commit -m "message"' />
                        <AdvancedGitSection branch={worktreeConfig.branch} />
                      </div>
                    </TabsContent>

                    {/* ── Aba 3: Arquivos alterados ── */}
                    <TabsContent
                      value="files"
                      className="flex flex-col gap-1.5 mt-2"
                    >
                      <div
                        className="flex flex-col gap-0.5 overflow-y-auto rounded-md border bg-muted/30 p-1.5"
                        style={{ maxHeight: "calc(80vh - 14rem)" }}
                      >
                        {changedFiles === null ? (
                          <span className="flex items-center gap-1 px-1 text-[11px] italic text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                            Carregando arquivos…
                          </span>
                        ) : changedFiles.length === 0 ? (
                          <span className="px-1 text-[11px] italic text-muted-foreground">
                            Nenhum arquivo modificado.
                          </span>
                        ) : (
                          changedFiles.map((file) => {
                            const FileIcon = fileIcon(file.path);
                            return (
                              <div
                                key={file.path}
                                className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60"
                              >
                                <span
                                  className={cn(
                                    "w-4 shrink-0 overflow-hidden text-center font-mono text-xs font-semibold",
                                    statusColor(file.status),
                                  )}
                                  title={statusLabel(file.status)}
                                >
                                  {file.status?.trim()[0] ?? "?"}
                                </span>
                                {file.isDir ? (
                                  <span
                                    className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden truncate font-mono text-[11px] text-muted-foreground"
                                    title={file.path}
                                  >
                                    <FolderOpen className="size-3 shrink-0" />
                                    {file.path}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className={cn(
                                      "flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-left font-mono text-[11px] hover:underline",
                                      file.status?.trim()[0] === "D" &&
                                        "line-through opacity-60",
                                    )}
                                    title={file.path}
                                    onClick={() =>
                                      setFileContentModal(file.path)
                                    }
                                  >
                                    <FileIcon className="size-3 shrink-0 text-muted-foreground" />
                                    <span className="truncate">
                                      {file.path}
                                    </span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                                  title="Descartar alterações"
                                  onClick={() => handleExcludeFile(file.path)}
                                >
                                  <X className="size-3" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </TabsContent>

                    {/* ── Aba 4: Helpers ── */}
                    <TabsContent
                      value="helpers"
                      className="flex flex-col gap-1.5 mt-2"
                    >
                      <div
                        className="flex flex-col gap-0.5 overflow-y-auto rounded-md border bg-muted/30 p-1.5"
                        style={{ maxHeight: "calc(80vh - 14rem)" }}
                      >
                        {helpersFiles === null ? (
                          <span className="flex items-center gap-1 px-1 text-[11px] italic text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                            Carregando arquivos…
                          </span>
                        ) : helpersFiles.length === 0 ? (
                          <span className="px-1 text-[11px] italic text-muted-foreground">
                            Nenhum arquivo na pasta de helpers.
                          </span>
                        ) : (
                          helpersFiles.map((file) => {
                            const FileIcon = fileIcon(file);
                            return (
                              <button
                                key={file}
                                type="button"
                                className="flex min-w-0 w-full items-center gap-1 text-left font-mono text-[11px] px-1 py-0.5 rounded hover:bg-muted/60 hover:underline"
                                title={file}
                                onClick={() => setHelpersFileModal(file)}
                              >
                                <FileIcon className="size-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{file}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            </div>

            {item.itemType && (
              <div className="flex flex-col gap-2">
                <SidebarLabel>{t("card.type")}</SidebarLabel>
                <span className="text-sm">{item.itemType}</span>
              </div>
            )}
            {!item.itemType && item.type !== "Issue" && (
              <div className="flex flex-col gap-2">
                <SidebarLabel>{t("card.type")}</SidebarLabel>
                <span className="text-sm">
                  {TYPE_LABEL[item.type] ?? item.type}
                </span>
              </div>
            )}

            {/* ── Execuções (agent-runs) quando o card não tem branch configurada:
                 os runs vivem no SQLite e continuam visíveis mesmo sem worktree ── */}
            {!isConfigured &&
              Array.isArray(cardRuns) &&
              cardRuns.length > 0 && (
                <div className="flex flex-col gap-2">
                  <SidebarLabel>{t("running.card.title")}</SidebarLabel>
                  <CardRunsList runs={cardRuns} onOpen={setOpenRunId} />
                </div>
              )}
          </aside>
        </div>
      </DialogContent>
      {showCreateBranch && board && (
        <CreateBranchModal
          board={board}
          item={item}
          onClose={() => {
            setShowCreateBranch(false);
            loadWorktreeConfig();
            onWorktreeChange?.();
          }}
        />
      )}
      {showEnqueueAgent && board && isConfigured && (
        <EnqueueAgentModal
          board={board}
          item={item}
          worktree={worktreeConfig}
          onClose={() => {
            setShowEnqueueAgent(false);
            loadCardRuns();
          }}
        />
      )}
      {openRunId && (
        <RunModal
          runId={openRunId}
          onClose={() => {
            setOpenRunId(null);
            loadCardRuns();
          }}
        />
      )}
      {fileContentModal && (
        <FileContentModal
          worktreeId={worktreeId}
          filePath={fileContentModal}
          onClose={() => setFileContentModal(null)}
        />
      )}
      {helpersFileModal && (
        <FileContentModal
          worktreeId={worktreeId}
          filePath={helpersFileModal}
          fetchUrl={`/api/config/worktrees/${encodeURIComponent(worktreeId)}/helpers-file?file=${encodeURIComponent(helpersFileModal)}`}
          onClose={() => setHelpersFileModal(null)}
        />
      )}
    </Dialog>
  );
}
