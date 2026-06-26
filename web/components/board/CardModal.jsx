"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import {
  AlertTriangle,
  Archive,
  FileText,
  FolderOpen,
  GitBranch,
  GitMerge,
  GitPullRequest,
  ListChecks,
  Loader2,
  Palette,
  Pencil,
  Play,
  RotateCcw,
  Send,
  X,
  Zap,
} from "lucide-react";
import CreateBranchModal from "@/components/CreateBranchModal.jsx";
import CopyCmd from "@/components/board/CopyCmd.jsx";
import TlcFileModal from "@/components/board/TlcFileModal.jsx";
import FileContentModal from "@/components/board/FileContentModal.jsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { Separator } from "@/components/ui/separator.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.jsx";
import { cn } from "@/lib/utils";
import { statusColor, statusLabel, fileIcon } from "@/lib/fileVisuals";

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
  "create-pr": "PR",
};

const RUN_DEFAULTS = {
  task: { model: "sonnet", effort: "high", label: "Executar Tarefa" },
  tlc: { model: "opus", effort: "high", label: "Executar TLC" },
  spec: { model: "sonnet", effort: "medium", label: "Executar Spec" },
  eval: { model: "sonnet", effort: "high", label: "Executar Spec-Eval" },
  commitPush: { model: "haiku", effort: "low", label: "Commit & Push" },
  createPR: { model: "haiku", effort: "medium", label: "Criar Pull Request" },
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
        <span className="text-[10px] font-semibold uppercase text-muted-foreground leading-none">
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

export default function CardModal({ item, board, onClose, onWorktreeChange }) {
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [tlcFileModal, setTlcFileModal] = useState(null); // null | "spec" | "design" | "tasks"
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

  const isConfigured = !!worktreeConfig;
  const isChecking = worktreeConfig === null && worktreeId !== null;

  const [specSending, setSpecSending] = useState(false);
  const [tlcSending, setTlcSending] = useState(false);
  const [tlcExecSending, setTlcExecSending] = useState(false);
  const [specEvalSending, setSpecEvalSending] = useState(false);
  const [commitPushSending, setCommitPushSending] = useState(false);
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [tlcFiles, setTlcFiles] = useState(null); // { spec, design, tasks } from live scan
  const [changedFiles, setChangedFiles] = useState(null); // null=not loaded, array=loaded
  const [fileContentModal, setFileContentModal] = useState(null); // null | file path string
  const [pullBehind, setPullBehind] = useState(null); // null=not checked, number=count
  const [pullSending, setPullSending] = useState(false);
  const [helpersFiles, setHelpersFiles] = useState(null); // null=not loaded, array=loaded
  const [helpersFileModal, setHelpersFileModal] = useState(null); // null | file path string
  const [errorModal, setErrorModal] = useState(null); // null | string
  const [runConfirmModal, setRunConfirmModal] = useState(null); // null | { action, model, effort }
  const [logText, setLogText] = useState("");
  const [mainTab, setMainTab] = useState("desc");
  const [messageText, setMessageText] = useState("");
  const [messageModel, setMessageModel] = useState("sonnet");
  const [messageEffort, setMessageEffort] = useState("medium");
  const [messageSending, setMessageSending] = useState(false);
  const [resetWorktreeSending, setResetWorktreeSending] = useState(false);
  const [createPrSending, setCreatePrSending] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("__new__");
  const logRef = useRef(null);
  const prevAnyRunningRef = useRef(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setClaudeStatus(d.claude ?? null))
      .catch(() => setClaudeStatus(null));
  }, []);

  function loadChangedFiles() {
    if (!worktreeId) return;
    setChangedFiles(null);
    fetch(`/api/config/worktrees/${encodeURIComponent(worktreeId)}/changed-files`)
      .then((r) => r.json())
      .then((d) => setChangedFiles(d.files ?? []))
      .catch(() => setChangedFiles([]));
  }

  useEffect(() => {
    const taskDone =
      worktreeConfig?.status === "done" ||
      worktreeConfig?.tlcExecStatus === "done" ||
      worktreeConfig?.commitPushStatus === "done" ||
      worktreeConfig?.commitPushStatus === "error";
    if (taskDone) loadChangedFiles();
  }, [worktreeConfig?.status, worktreeConfig?.tlcExecStatus, worktreeConfig?.commitPushStatus]);

  async function handleExcludeFile(filePath) {
    try {
      await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/file?file=${encodeURIComponent(filePath)}`,
        { method: "DELETE" },
      );
      loadChangedFiles();
    } catch (err) {
      console.error("[exclude-file]", err);
    }
  }

  function loadBehindCount() {
    if (!worktreeId) return;
    setPullBehind(null);
    fetch(`/api/config/worktrees/${encodeURIComponent(worktreeId)}/behind-count`)
      .then((r) => r.json())
      .then((d) => setPullBehind(d.behind ?? 0))
      .catch(() => setPullBehind(0));
  }

  function loadHelpersFiles() {
    if (!worktreeId) return;
    setHelpersFiles(null);
    fetch(`/api/config/worktrees/${encodeURIComponent(worktreeId)}/helpers-files`)
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
    } catch (err) {
      console.error("[pull]", err);
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
    worktreeConfig?.status === "running" ||
    worktreeConfig?.tlcStatus === "running" ||
    worktreeConfig?.tlcExecStatus === "running" ||
    worktreeConfig?.specEvalStatus === "running" ||
    worktreeConfig?.commitPushStatus === "running" ||
    worktreeConfig?.pullStatus === "running" ||
    worktreeConfig?.messageStatus === "running" ||
    worktreeConfig?.prStatus === "running";

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
      .then((d) => { if (d.content) setLogText(d.content); })
      .catch(() => { });
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

  // Scan .specs/features/ whenever TLC is done so buttons reflect real disk state.
  useEffect(() => {
    if (worktreeConfig?.tlcStatus !== "done" || !worktreeId) return;
    fetch(`/api/config/worktrees/${encodeURIComponent(worktreeId)}/tlc-scan`)
      .then((r) => r.json())
      .then((d) => setTlcFiles(d.tlcFiles ?? null))
      .catch(() => setTlcFiles(null));
  }, [worktreeConfig?.tlcStatus, worktreeId]);

  // Poll while any background job is running
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(loadWorktreeConfig, 3000);
    return () => clearInterval(timer);
  }, [
    worktreeConfig?.status,
    worktreeConfig?.tlcStatus,
    worktreeConfig?.tlcExecStatus,
    worktreeConfig?.specEvalStatus,
    worktreeConfig?.commitPushStatus,
    worktreeConfig?.pullStatus,
    worktreeConfig?.messageStatus,
    worktreeConfig?.prStatus,
  ]);

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
            sessionId: selectedSessionId === "__new__" ? undefined : selectedSessionId,
          }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessageText("");
      if (data.sessionId) setSelectedSessionId(data.sessionId);
      loadWorktreeConfig();
      onWorktreeChange?.();
    } catch (err) {
      console.error("[send-message]", err);
    } finally {
      setMessageSending(false);
    }
  }

  async function handleRunTlc({ model, effort, sessionId } = {}) {
    setTlcSending(true);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/run-tlc`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            number: item.number,
            body: item.body,
            model,
            effort,
            sessionId: sessionId === "__new__" ? undefined : sessionId,
          }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadWorktreeConfig();
      onWorktreeChange?.();
    } catch (err) {
      console.error("[run-tlc]", err);
    } finally {
      setTlcSending(false);
    }
  }

  async function handleResetWorktree() {
    if (!worktreeId) return;
    setResetWorktreeSending(true);
    try {
      await fetch(`/api/config/worktrees/${encodeURIComponent(worktreeId)}`, {
        method: "DELETE",
      });
      setTlcFiles(null);
      loadWorktreeConfig();
      onWorktreeChange?.();
    } catch (err) {
      console.error("[reset-worktree]", err);
    } finally {
      setResetWorktreeSending(false);
    }
  }

  async function handleCreatePR({ model, effort, sessionId } = {}) {
    setCreatePrSending(true);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/create-pr`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            number: item.number,
            model,
            effort,
            sessionId: sessionId === "__new__" ? undefined : sessionId,
          }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadWorktreeConfig();
      onWorktreeChange?.();
    } catch (err) {
      console.error("[create-pr]", err);
    } finally {
      setCreatePrSending(false);
    }
  }

  async function handleRunTlcExec({ model, effort, sessionId } = {}) {
    setTlcExecSending(true);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/run-tlc-exec`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, effort, sessionId: sessionId === "__new__" ? undefined : sessionId }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadWorktreeConfig();
      onWorktreeChange?.();
    } catch (err) {
      console.error("[run-tlc-exec]", err);
    } finally {
      setTlcExecSending(false);
    }
  }

  async function handleRunSpecEval({ model, effort, validation, runTests, sessionId } = {}) {
    setSpecEvalSending(true);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/run-spec-eval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            number: item.number,
            body: item.body,
            model,
            effort,
            validation,
            runTests,
            sessionId: sessionId === "__new__" ? undefined : sessionId,
          }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadWorktreeConfig();
      onWorktreeChange?.();
    } catch (err) {
      console.error("[run-spec-eval]", err);
    } finally {
      setSpecEvalSending(false);
    }
  }

  async function handleCommitPush({ model, effort, sessionId } = {}) {
    setCommitPushSending(true);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/commit-push`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            effort,
            sessionId: sessionId === "__new__" ? undefined : sessionId,
          }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadWorktreeConfig();
      onWorktreeChange?.();
    } catch (err) {
      console.error("[commit-push]", err);
    } finally {
      setCommitPushSending(false);
    }
  }

  async function handleRunSpec({ model, effort, sessionId } = {}) {
    setSpecSending(true);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            number: item.number,
            body: item.body,
            model,
            effort,
            sessionId: sessionId === "__new__" ? undefined : sessionId,
          }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadWorktreeConfig();
      onWorktreeChange?.();
    } catch (err) {
      console.error("[run-spec]", err);
    } finally {
      setSpecSending(false);
    }
  }

  const displayLogText = useMemo(() => {
    if (!logText) return "";
    // Matches simple event-type lines like [system/thinking_tokens] or [tool/result]
    const COLLAPSIBLE = /^\[[\w/]+\]$/;
    const lines = logText.split("\n");
    const out = [];
    let lastCollapsible = null;   // the line text
    let lastCollapsibleIdx = -1;  // its index in out[]
    let count = 0;

    for (const line of lines) {
      if (!line.trim()) {
        // Preserve at most one blank line; absorb extras
        if (out.length > 0 && out[out.length - 1] !== "") out.push("");
        continue;
      }

      if (COLLAPSIBLE.test(line) && line === lastCollapsible) {
        // Same collapsible line: update the existing entry in-place
        count++;
        out[lastCollapsibleIdx] = `${line}  ×${count}`;
        // Remove the trailing blank that was added after the previous occurrence
        if (out[out.length - 1] === "") out.pop();
      } else {
        out.push(line);
        if (COLLAPSIBLE.test(line)) {
          lastCollapsible = line;
          lastCollapsibleIdx = out.length - 1;
          count = 1;
        } else {
          // Non-collapsible content resets the collapsible tracking
          lastCollapsible = null;
          lastCollapsibleIdx = -1;
          count = 0;
        }
      }
    }

    return out.join("\n");
  }, [logText]);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !fileContentModal && !helpersFileModal && !tlcFileModal && !showCreateBranch && !errorModal) {
          onClose();
        }
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="w-full sm:max-w-[calc(100%-2rem)] h-[80vh] gap-0 overflow-hidden p-0"
      >
        {runConfirmModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-background border rounded-lg shadow-xl w-full max-w-md overflow-hidden mx-4">
              <div className="flex items-center border-b px-5 py-4">
                <span className="text-sm font-semibold flex-1">
                  {RUN_DEFAULTS[runConfirmModal.action]?.label}
                </span>
              </div>
              <div className="flex flex-col gap-4 px-5 py-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sessão</span>
                  <Select
                    value={runConfirmModal.session}
                    onValueChange={(v) => setRunConfirmModal((s) => ({ ...s, session: v }))}
                  >
                    <SelectTrigger size="sm" className="text-xs w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">Nova Sessão</SelectItem>
                      {[...(worktreeConfig?.chatSessions ?? [])]
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id} title={s.description}>
                            [{ORIGIN_LABEL[s.origin] ?? s.origin}] {s.description}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Modelo</span>
                  <Select
                    value={runConfirmModal.model}
                    onValueChange={(v) => setRunConfirmModal((s) => ({ ...s, model: v }))}
                  >
                    <SelectTrigger size="sm" className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="haiku">Haiku</SelectItem>
                      <SelectItem value="sonnet">Sonnet</SelectItem>
                      <SelectItem value="opus">Opus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Effort</span>
                  <Select
                    value={runConfirmModal.effort}
                    onValueChange={(v) => setRunConfirmModal((s) => ({ ...s, effort: v }))}
                  >
                    <SelectTrigger size="sm" className="text-xs">
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

                {runConfirmModal.action === "eval" && (
                  <>
                    <div className="border-t pt-3 flex flex-col gap-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Comandos de Validação
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: "install", label: "Instalação", placeholder: "npm install" },
                          { key: "build", label: "Build", placeholder: "npm run build" },
                          { key: "lint", label: "Lint", placeholder: "npm run lint" },
                          { key: "test", label: "Testes", placeholder: "npm test" },
                        ].map(({ key, label, placeholder }) => (
                          <div key={key} className="flex flex-col gap-1">
                            <Label className="text-[10px] text-muted-foreground">{label}</Label>
                            <Input
                              type="text"
                              value={runConfirmModal.validation?.[key] ?? ""}
                              onChange={(e) =>
                                setRunConfirmModal((s) => ({
                                  ...s,
                                  validation: { ...s.validation, [key]: e.target.value },
                                }))
                              }
                              placeholder={placeholder}
                              className="h-7 font-mono text-[11px] px-2"
                            />
                          </div>
                        ))}
                        <div className="col-span-2 flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Outro</Label>
                          <Input
                            type="text"
                            value={runConfirmModal.validation?.extra ?? ""}
                            onChange={(e) =>
                              setRunConfirmModal((s) => ({
                                ...s,
                                validation: { ...s.validation, extra: e.target.value },
                              }))
                            }
                            placeholder="comando personalizado"
                            className="h-7 font-mono text-[11px] px-2"
                          />
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={runConfirmModal.runTests ?? true}
                        onChange={(e) =>
                          setRunConfirmModal((s) => ({ ...s, runTests: e.target.checked }))
                        }
                        className="size-3.5 accent-primary"
                      />
                      <span className="text-xs text-muted-foreground">Rodar e avaliar testes</span>
                    </label>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t px-5 py-3">
                <Button variant="ghost" size="sm" onClick={() => setRunConfirmModal(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const { action, model, effort, validation, runTests, session } = runConfirmModal;
                    setRunConfirmModal(null);
                    if (action === "task") handleRunSpec({ model, effort, sessionId: session });
                    else if (action === "tlc") handleRunTlc({ model, effort, sessionId: session });
                    else if (action === "spec") handleRunTlcExec({ model, effort, sessionId: session });
                    else if (action === "eval") handleRunSpecEval({ model, effort, validation, runTests, sessionId: session });
                    else if (action === "commitPush") handleCommitPush({ model, effort, sessionId: session });
                    else if (action === "createPR") handleCreatePR({ model, effort, sessionId: session });
                  }}
                >
                  Executar
                </Button>
              </div>
            </div>
          </div>
        )}
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
                        const avatarUrl = typeof a === "string" ? null : a?.avatarUrl;
                        if (!login) return null;
                        return <Assignee key={login} login={login} avatarUrl={avatarUrl} size="size-6" />;
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
                    "text-[11px] font-bold uppercase tracking-wider transition-colors",
                    mainTab === "desc"
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Descrição
                </button>
                {logText && (
                  <button
                    type="button"
                    onClick={() => setMainTab("logs")}
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                      mainTab === "logs"
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Logs
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
                <pre className="font-mono text-[11px] leading-relaxed text-green-400/90 whitespace-pre-wrap break-all">
                  {displayLogText}
                </pre>
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
                      <SelectItem value="__new__">Nova Sessão</SelectItem>
                      {[...(worktreeConfig?.chatSessions ?? [])]
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id} title={s.description}>
                            [{ORIGIN_LABEL[s.origin] ?? s.origin}] {s.description}
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
                  placeholder="Enviar uma mensagem ao agente nesta worktree…"
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
                      <SelectTrigger size="sm" className="text-xs" title="Model">
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
                      <SelectTrigger size="sm" className="text-xs" title="Effort">
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
                  <Button
                    size="sm"
                    type="button"
                    className="gap-2"
                    disabled={!messageText.trim() || anyRunning || messageSending}
                    onClick={handleSendMessage}
                  >
                    {messageSending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    <span>Enviar</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── sidebar ── */}
          <aside className="flex w-[280px] shrink-0 flex-col gap-5 overflow-y-auto border-l bg-muted/30 p-5">
            <div className="flex flex-col gap-2">
              <SidebarLabel>Gatilhos</SidebarLabel>
              <div className="flex flex-col gap-1.5">
                {/* ── Configurar Branch (inalterado) ── */}
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
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
                    <span className="ml-auto text-xs">
                      {isConfigured ? "✓" : "▷"}
                    </span>
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
                      {resetWorktreeSending
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : <RotateCcw className="size-3.5" />}
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
                        {worktreeConfig.path.split(/[\\/]/).filter(Boolean).pop()}
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
                    <TabsList className="w-full grid grid-cols-4 h-8">
                      <TabsTrigger value="exec" title="Executar" className="px-0">
                        <Play className="size-3.5" />
                      </TabsTrigger>
                      <TabsTrigger value="git" title="Git" className="px-0">
                        <GitBranch className="size-3.5" />
                      </TabsTrigger>
                      <TabsTrigger value="files" title="Arquivos alterados" className="px-0">
                        <FolderOpen className="size-3.5" />
                      </TabsTrigger>
                      <TabsTrigger value="helpers" title="Helpers" className="px-0">
                        <Archive className="size-3.5" />
                      </TabsTrigger>
                    </TabsList>

                    {/* ── Aba 1: Executar ── */}
                    <TabsContent value="exec" className="flex flex-col gap-1.5 mt-2">
                      {(() => {
                        const runStatus = worktreeConfig?.status;
                        const isRunning = runStatus === "running" || specSending;
                        const isDone = runStatus === "done";
                        const isError = runStatus === "error";
                        const isTlcRunning =
                          worktreeConfig?.tlcStatus === "running" || tlcSending;
                        return (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={isRunning || isTlcRunning}
                              onClick={() => setRunConfirmModal({ action: "task", ...RUN_DEFAULTS.task, session: "__new__" })}
                              className={cn(
                                "w-full justify-start gap-2 text-xs",
                                isDone &&
                                "border-state-completed/50 text-state-completed opacity-75",
                                isError &&
                                "border-destructive/50 text-destructive opacity-75",
                              )}
                            >
                              <Pencil className="size-3.5" />
                              <span>Executar Tarefa</span>
                              <span className="ml-auto text-xs">
                                {isRunning
                                  ? "…"
                                  : isDone
                                    ? "✓"
                                    : isError
                                      ? "↺"
                                      : "▷"}
                              </span>
                            </Button>
                            {isRunning && (
                              <span className="flex items-center gap-1 text-[11px] italic text-muted-foreground">
                                <Loader2 className="size-3 shrink-0 animate-spin" />
                                Executando em background…
                              </span>
                            )}
                            {isDone && (
                              <span className="text-[11px] text-state-completed">
                                ✓ Concluído · clique para re-executar
                              </span>
                            )}
                            {isError && worktreeConfig?.lastError && (
                              <button
                                type="button"
                                onClick={() => setErrorModal(worktreeConfig.lastError)}
                                className="flex items-center gap-1 truncate text-[11px] text-destructive hover:underline text-left"
                              >
                                <AlertTriangle className="size-3 shrink-0" />
                                <span className="truncate">{worktreeConfig.lastError}</span>
                              </button>
                            )}
                          </>
                        );
                      })()}

                      {(() => {
                        const tlcStatus = worktreeConfig?.tlcStatus;
                        const isTlcRunning = tlcStatus === "running" || tlcSending;
                        const isTlcDone = tlcStatus === "done";
                        const isTlcError = tlcStatus === "error";
                        const hasTlcSkill = claudeStatus?.tlcSkill ?? false;
                        const isRunning =
                          worktreeConfig?.status === "running" || specSending;
                        return (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={!hasTlcSkill || isTlcRunning || isRunning}
                              title={
                                !hasTlcSkill
                                  ? "Skill tlc-spec-driven não instalada — configure nas Configurações"
                                  : undefined
                              }
                              onClick={() => setRunConfirmModal({ action: "tlc", ...RUN_DEFAULTS.tlc, session: "__new__" })}
                              className={cn(
                                "w-full justify-start gap-2 text-xs",
                                isTlcDone &&
                                "border-state-completed/50 text-state-completed opacity-75",
                                isTlcError &&
                                "border-destructive/50 text-destructive opacity-75",
                              )}
                            >
                              <Zap className="size-3.5" />
                              <span>Executar TLC</span>
                              <span className="ml-auto text-xs">
                                {isTlcRunning
                                  ? "…"
                                  : isTlcDone
                                    ? "✓"
                                    : isTlcError
                                      ? "↺"
                                      : "▷"}
                              </span>
                            </Button>
                            {isTlcRunning && (
                              <span className="flex items-center gap-1 text-[11px] italic text-muted-foreground">
                                <Loader2 className="size-3 shrink-0 animate-spin" />
                                Criando spec, design e tasks…
                              </span>
                            )}
                            {isTlcError && worktreeConfig?.tlcLastError && (
                              <button
                                type="button"
                                onClick={() => setErrorModal(worktreeConfig.tlcLastError)}
                                className="flex items-center gap-1 truncate text-[11px] text-destructive hover:underline text-left"
                              >
                                <AlertTriangle className="size-3 shrink-0" />
                                <span className="truncate">{worktreeConfig.tlcLastError}</span>
                              </button>
                            )}
                            {isTlcDone && (
                              <div className="flex gap-1.5">
                                {[
                                  { type: "spec", Icon: FileText, label: "Spec" },
                                  { type: "design", Icon: Palette, label: "Design" },
                                  { type: "tasks", Icon: ListChecks, label: "Tasks" },
                                ].map(({ type, Icon, label }) => {
                                  const exists = tlcFiles?.[type] ?? false;
                                  return (
                                    <Button
                                      key={type}
                                      variant="outline"
                                      size="sm"
                                      type="button"
                                      disabled={!exists}
                                      title={
                                        !exists
                                          ? `${label} não foi gerado`
                                          : `Abrir ${label}`
                                      }
                                      onClick={() => setTlcFileModal(type)}
                                      className={cn(
                                        "flex-1 gap-1 text-xs",
                                        exists &&
                                        "border-state-completed/50 text-state-completed",
                                      )}
                                    >
                                      <Icon className="size-3.5" />
                                      <span>{label}</span>
                                    </Button>
                                  );
                                })}
                              </div>
                            )}

                            {(() => {
                              const execStatus = worktreeConfig?.tlcExecStatus;
                              const isExecRunning =
                                execStatus === "running" || tlcExecSending;
                              const isExecDone = execStatus === "done";
                              const isExecError = execStatus === "error";
                              return (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    disabled={!isTlcDone || isExecRunning}
                                    title={
                                      !isTlcDone
                                        ? "Execute o TLC antes de executar a Spec"
                                        : undefined
                                    }
                                    onClick={() => setRunConfirmModal({ action: "spec", ...RUN_DEFAULTS.spec, session: "__new__" })}
                                    className={cn(
                                      "w-full justify-start gap-2 text-xs",
                                      isExecDone &&
                                      "border-state-completed/50 text-state-completed opacity-75",
                                      isExecError &&
                                      "border-destructive/50 text-destructive opacity-75",
                                    )}
                                  >
                                    <Play className="size-3.5" />
                                    <span>Executar Spec</span>
                                    <span className="ml-auto text-xs">
                                      {isExecRunning
                                        ? "…"
                                        : isExecDone
                                          ? "✓"
                                          : isExecError
                                            ? "↺"
                                            : "▷"}
                                    </span>
                                  </Button>
                                  {isExecRunning && (
                                    <span className="flex items-center gap-1 text-[11px] italic text-muted-foreground">
                                      <Loader2 className="size-3 shrink-0 animate-spin" />
                                      Implementando, commitando e fazendo push…
                                    </span>
                                  )}
                                  {isExecDone && (
                                    <span className="text-[11px] text-state-completed">
                                      ✓ Concluído · clique para re-executar
                                    </span>
                                  )}
                                  {isExecError &&
                                    worktreeConfig?.tlcExecLastError && (
                                      <button
                                        type="button"
                                        onClick={() => setErrorModal(worktreeConfig.tlcExecLastError)}
                                        className="flex items-center gap-1 truncate text-[11px] text-destructive hover:underline text-left"
                                      >
                                        <AlertTriangle className="size-3 shrink-0" />
                                        <span className="truncate">{worktreeConfig.tlcExecLastError}</span>
                                      </button>
                                    )}
                                </>
                              );
                            })()}
                          </>
                        );
                      })()}

                      {(() => {
                        const specEvalStatus = worktreeConfig?.specEvalStatus;
                        const isEvalRunning =
                          specEvalStatus === "running" || specEvalSending;
                        const isEvalDone = specEvalStatus === "done";
                        const isEvalError = specEvalStatus === "error";
                        const hasEvalSkill =
                          claudeStatus?.specDrivenEvalSkill ?? false;
                        // Liberado quando "Executar Tarefa" ou "Executar Spec" concluiu
                        const ranImpl =
                          worktreeConfig?.status === "done" ||
                          worktreeConfig?.tlcExecStatus === "done";
                        const anyOtherRunning =
                          worktreeConfig?.status === "running" ||
                          worktreeConfig?.tlcStatus === "running" ||
                          worktreeConfig?.tlcExecStatus === "running" ||
                          specSending ||
                          tlcSending ||
                          tlcExecSending;
                        return (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={
                                !hasEvalSkill ||
                                !ranImpl ||
                                isEvalRunning ||
                                anyOtherRunning
                              }
                              title={
                                !hasEvalSkill
                                  ? "Skill spec-driven-eval não instalada — configure nas Configurações"
                                  : !ranImpl
                                    ? "Execute a Tarefa ou a Spec antes de avaliar"
                                    : undefined
                              }
                              onClick={() => setRunConfirmModal({
                                action: "eval",
                                ...RUN_DEFAULTS.eval,
                                session: "__new__",
                                validation: {
                                  install: board?.validation?.install ?? "",
                                  build: board?.validation?.build ?? "",
                                  lint: board?.validation?.lint ?? "",
                                  test: board?.validation?.test ?? "",
                                  extra: board?.validation?.extra ?? "",
                                },
                                runTests: true,
                              })}
                              className={cn(
                                "w-full justify-start gap-2 text-xs",
                                isEvalDone &&
                                "border-state-completed/50 text-state-completed opacity-75",
                                isEvalError &&
                                "border-destructive/50 text-destructive opacity-75",
                              )}
                            >
                              <ListChecks className="size-3.5" />
                              <span>Executar Spec-Eval</span>
                              <span className="ml-auto text-xs">
                                {isEvalRunning
                                  ? "…"
                                  : isEvalDone
                                    ? "✓"
                                    : isEvalError
                                      ? "↺"
                                      : "▷"}
                              </span>
                            </Button>
                            {isEvalRunning && (
                              <span className="flex items-center gap-1 text-[11px] italic text-muted-foreground">
                                <Loader2 className="size-3 shrink-0 animate-spin" />
                                Avaliando implementação contra a spec…
                              </span>
                            )}
                            {isEvalDone && (
                              <span className="text-[11px] text-state-completed">
                                ✓ Avaliação concluída · clique para re-avaliar
                              </span>
                            )}
                            {isEvalError &&
                              worktreeConfig?.specEvalLastError && (
                                <button
                                  type="button"
                                  onClick={() => setErrorModal(worktreeConfig.specEvalLastError)}
                                  className="flex items-center gap-1 truncate text-[11px] text-destructive hover:underline text-left"
                                >
                                  <AlertTriangle className="size-3 shrink-0" />
                                  <span className="truncate">{worktreeConfig.specEvalLastError}</span>
                                </button>
                              )}
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* ── Aba 2: Git ── */}
                    <TabsContent value="git" className="flex flex-col gap-1.5 mt-2">
                      {/* Pull */}
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={pullBehind === null || pullBehind === 0 || pullSending || worktreeConfig?.pullStatus === "running"}
                        onClick={handlePull}
                        className="w-full justify-start gap-2 text-xs"
                      >
                        <GitPullRequest className="size-3.5" />
                        <span>
                          {pullSending || worktreeConfig?.pullStatus === "running"
                            ? "Sincronizando…"
                            : pullBehind === null
                              ? "Verificando…"
                              : pullBehind > 0
                                ? `Pull (${pullBehind} commit${pullBehind > 1 ? "s" : ""})`
                                : "Pull (atualizado)"}
                        </span>
                        {(pullSending || worktreeConfig?.pullStatus === "running") && (
                          <Loader2 className="ml-auto size-3 animate-spin" />
                        )}
                      </Button>

                      {(() => {
                        const commitPushStatus = worktreeConfig?.commitPushStatus;
                        const isCommitPushRunning =
                          commitPushStatus === "running" || commitPushSending;
                        const isCommitPushDone = commitPushStatus === "done";
                        const isCommitPushError = commitPushStatus === "error";
                        const hasFiles = changedFiles?.length > 0;
                        return (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            disabled={isCommitPushRunning || !hasFiles}
                            onClick={() => setRunConfirmModal({ action: "commitPush", ...RUN_DEFAULTS.commitPush, session: "__new__" })}
                            title={
                              isCommitPushError
                                ? worktreeConfig?.commitPushLastError
                                : undefined
                            }
                            className={cn(
                              "w-full justify-start gap-2 text-xs",
                              !hasFiles && isCommitPushDone
                                ? "border-state-completed/50 text-state-completed opacity-75"
                                : isCommitPushError
                                  ? "border-destructive/50 text-destructive opacity-75"
                                  : !isCommitPushRunning && "border-primary/60 text-primary",
                            )}
                          >
                            <span>
                              {isCommitPushRunning
                                ? "Enviando…"
                                : isCommitPushError
                                  ? "↺ Tentar"
                                  : !hasFiles && isCommitPushDone
                                    ? "✓ Enviado"
                                    : "Commit & Push"}
                            </span>
                          </Button>
                        );
                      })()}
                      <div className="flex flex-col gap-1 mt-0.5">
                        <CopyCmd cmd={`git checkout ${worktreeConfig.branch}`} />
                        <CopyCmd cmd={`git fetch origin`} />
                        <CopyCmd cmd={`git reset --hard origin/${worktreeConfig.branch}`} />
                        <CopyCmd cmd="git reset --soft HEAD~1" />
                        <CopyCmd cmd="git reset" />
                        <CopyCmd cmd="git add ." />
                        <CopyCmd cmd='git commit -m "message"' />
                        <CopyCmd cmd={`git push --force-with-lease origin ${worktreeConfig.branch}`} />
                      </div>
                      {worktreeConfig.originBranch && (() => {
                        const prStatus = worktreeConfig?.prStatus;
                        const isPrRunning = prStatus === "running" || createPrSending;
                        const isPrDone = prStatus === "done";
                        const isPrError = prStatus === "error";
                        const hasFiles = changedFiles?.length > 0;
                        return (
                          <div className="mt-1 flex flex-col gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={isPrRunning || hasFiles || changedFiles === null}
                              onClick={() => setRunConfirmModal({ action: "createPR", ...RUN_DEFAULTS.createPR, session: "__new__" })}
                              title={isPrError ? worktreeConfig?.prLastError : undefined}
                              className={cn(
                                "w-full justify-start gap-2 text-xs",
                                isPrDone
                                  ? "border-state-completed/50 text-state-completed opacity-75"
                                  : isPrError
                                    ? "border-destructive/50 text-destructive opacity-75"
                                    : !isPrRunning && "border-primary/60 text-primary",
                              )}
                            >
                              {isPrRunning
                                ? <Loader2 className="size-3.5 animate-spin" />
                                : <GitMerge className="size-3.5" />}
                              <span>
                                {isPrRunning
                                  ? "Criando PR…"
                                  : isPrError
                                    ? "↺ Tentar PR"
                                    : isPrDone
                                      ? "✓ PR Criado"
                                      : `Criar PR → ${worktreeConfig.originBranch}`}
                              </span>
                            </Button>
                            {isPrDone && worktreeConfig?.prUrl && (
                              <a
                                href={worktreeConfig.prUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate px-1 text-[11px] text-primary hover:underline"
                              >
                                {worktreeConfig.prUrl}
                              </a>
                            )}
                          </div>
                        );
                      })()}
                    </TabsContent>

                    {/* ── Aba 3: Arquivos alterados ── */}
                    <TabsContent value="files" className="flex flex-col gap-1.5 mt-2">
                      <div className="flex flex-col gap-0.5 overflow-y-auto rounded-md border bg-muted/30 p-1.5" style={{ maxHeight: "calc(80vh - 14rem)" }}>
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
                                  "w-4 shrink-0 overflow-hidden text-center font-mono text-[10px] font-semibold",
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
                                    file.status?.trim()[0] === "D" && "line-through opacity-60",
                                  )}
                                  title={file.path}
                                  onClick={() => setFileContentModal(file.path)}
                                >
                                  <FileIcon className="size-3 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{file.path}</span>
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
                    <TabsContent value="helpers" className="flex flex-col gap-1.5 mt-2">
                      <div className="flex flex-col gap-0.5 overflow-y-auto rounded-md border bg-muted/30 p-1.5" style={{ maxHeight: "calc(80vh - 14rem)" }}>
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
                <SidebarLabel>Tipo</SidebarLabel>
                <span className="text-sm">{item.itemType}</span>
              </div>
            )}
            {!item.itemType && item.type !== "Issue" && (
              <div className="flex flex-col gap-2">
                <SidebarLabel>Tipo</SidebarLabel>
                <span className="text-sm">
                  {TYPE_LABEL[item.type] ?? item.type}
                </span>
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
      {tlcFileModal && (
        <TlcFileModal
          worktreeId={worktreeId}
          type={tlcFileModal}
          onClose={() => setTlcFileModal(null)}
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
      {errorModal && (
        <Dialog open modal={false} onOpenChange={(o) => { if (!o) setErrorModal(null); }}>
          <DialogContent
            aria-describedby={undefined}
            className="w-full sm:max-w-lg max-h-[70vh] flex flex-col gap-0 overflow-hidden p-0"
          >
            <div className="flex items-center gap-2 border-b px-5 py-4 shrink-0">
              <AlertTriangle className="size-4 text-destructive shrink-0" />
              <DialogTitle className="text-sm font-semibold text-destructive">
                Detalhes do erro
              </DialogTitle>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
                {errorModal}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
