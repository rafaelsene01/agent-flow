"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import {
  FileText,
  FolderOpen,
  GitBranch,
  ListChecks,
  Loader2,
  Palette,
  Pencil,
  Play,
  RotateCcw,
  X,
  Zap,
} from "lucide-react";
import CreateBranchModal from "@/components/CreateBranchModal.jsx";
import CopyCmd from "@/components/board/CopyCmd.jsx";
import TlcFileModal from "@/components/board/TlcFileModal.jsx";
import FileContentModal from "@/components/board/FileContentModal.jsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Separator } from "@/components/ui/separator.jsx";
import { cn } from "@/lib/utils";

const TYPE_LABEL = {
  Issue: "Issue",
  PullRequest: "Pull request",
  DraftIssue: "Draft issue",
};


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
  const [commitPushSending, setCommitPushSending] = useState(false);
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [tlcFiles, setTlcFiles] = useState(null); // { spec, design, tasks } from live scan
  const [changedFiles, setChangedFiles] = useState(null); // null=not loaded, array=loaded
  const [fileContentModal, setFileContentModal] = useState(null); // null | file path string

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
      worktreeConfig?.status === "done" || worktreeConfig?.tlcExecStatus === "done";
    if (taskDone) loadChangedFiles();
  }, [worktreeConfig?.status, worktreeConfig?.tlcExecStatus]);

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
    const anyRunning =
      worktreeConfig?.status === "running" ||
      worktreeConfig?.tlcStatus === "running" ||
      worktreeConfig?.tlcExecStatus === "running" ||
      worktreeConfig?.commitPushStatus === "running";
    if (!anyRunning) return;
    const timer = setInterval(loadWorktreeConfig, 3000);
    return () => clearInterval(timer);
  }, [
    worktreeConfig?.status,
    worktreeConfig?.tlcStatus,
    worktreeConfig?.tlcExecStatus,
    worktreeConfig?.commitPushStatus,
  ]);

  async function handleRunTlc() {
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
    try {
      await fetch(`/api/config/worktrees/${encodeURIComponent(worktreeId)}`, {
        method: "DELETE",
      });
      setTlcFiles(null);
      loadWorktreeConfig();
      onWorktreeChange?.();
    } catch (err) {
      console.error("[reset-worktree]", err);
    }
  }

  async function handleRunTlcExec() {
    setTlcExecSending(true);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/run-tlc-exec`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
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

  async function handleCommitPush() {
    setCommitPushSending(true);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/commit-push`,
        { method: "POST" },
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

  async function handleRunSpec() {
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

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="w-full sm:max-w-[calc(100%-2rem)] max-h-[88vh] gap-0 overflow-hidden p-0"
        >
          <div className="flex max-h-[88vh] min-h-0">
            {/* ── main ── */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 flex-col gap-2.5 px-6 pt-5 pb-3">
                {item.number != null && (
                  <span className="font-mono text-xs text-muted-foreground">
                    #{item.number}
                  </span>
                )}
                <DialogTitle className="text-xl font-semibold leading-snug">
                  {item.title}
                </DialogTitle>
                <Separator />
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Descrição
                </div>
              </div>
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
            </div>

            {/* ── sidebar ── */}
            <aside className="flex w-[280px] shrink-0 flex-col gap-5 overflow-y-auto border-l bg-muted/30 p-5">
              <div className="flex flex-col gap-2">
                <SidebarLabel>Gatilhos</SidebarLabel>
                <div className="flex flex-col gap-1.5">
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
                      >
                        <RotateCcw className="size-3.5" />
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
                          disabled={!isConfigured || isRunning || isTlcRunning}
                          onClick={handleRunSpec}
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
                          <span
                            className="block truncate text-[11px] text-destructive"
                            title={worktreeConfig.lastError}
                          >
                            ✕ {worktreeConfig.lastError}
                          </span>
                        )}
                      </>
                    );
                  })()}

                  {/* ── TLC button ── */}
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
                          disabled={
                            !isConfigured ||
                            !hasTlcSkill ||
                            isTlcRunning ||
                            isRunning
                          }
                          title={
                            !hasTlcSkill
                              ? "Skill tlc-spec-driven não instalada — configure nas Configurações"
                              : undefined
                          }
                          onClick={handleRunTlc}
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
                          <span
                            className="block truncate text-[11px] text-destructive"
                            title={worktreeConfig.tlcLastError}
                          >
                            ✕ {worktreeConfig.tlcLastError}
                          </span>
                        )}
                        {isTlcDone && (
                          <>
                            <div className="flex gap-1.5">
                              {[
                                { type: "spec", Icon: FileText, label: "Spec" },
                                {
                                  type: "design",
                                  Icon: Palette,
                                  label: "Design",
                                },
                                {
                                  type: "tasks",
                                  Icon: ListChecks,
                                  label: "Tasks",
                                },
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
                                    disabled={isExecRunning}
                                    onClick={handleRunTlcExec}
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
                                      <span
                                        className="block truncate text-[11px] text-destructive"
                                        title={worktreeConfig.tlcExecLastError}
                                      >
                                        ✕ {worktreeConfig.tlcExecLastError}
                                      </span>
                                    )}
                                </>
                              );
                            })()}
                          </>
                        )}
                      </>
                    );
                  })()}

                  {isConfigured &&
                    (() => {
                      const commitPushStatus = worktreeConfig?.commitPushStatus;
                      const isCommitPushRunning =
                        commitPushStatus === "running" || commitPushSending;
                      const isCommitPushDone = commitPushStatus === "done";
                      const isCommitPushError = commitPushStatus === "error";
                      return (
                        <div className="flex flex-col gap-1.5 border-t pt-2">
                          {(worktreeConfig?.status === "done" || worktreeConfig?.tlcExecStatus === "done") && (
                            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border bg-muted/30 p-1.5">
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
                                changedFiles.map((file) => (
                                  <div
                                    key={file.path}
                                    className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60"
                                  >
                                    <span className="w-4 shrink-0 font-mono text-[10px] text-muted-foreground">
                                      {file.status}
                                    </span>
                                    {file.isDir ? (
                                      <span
                                        className="flex min-w-0 flex-1 items-center gap-1 truncate font-mono text-[11px] text-muted-foreground"
                                        title={file.path}
                                      >
                                        <FolderOpen className="size-3 shrink-0" />
                                        {file.path}
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        className={cn(
                                          "min-w-0 flex-1 truncate text-left font-mono text-[11px] hover:underline",
                                          file.status === "D" && "line-through opacity-60",
                                        )}
                                        title={file.path}
                                        onClick={() => setFileContentModal(file.path)}
                                      >
                                        {file.path}
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
                                ))
                              )}
                            </div>
                          )}
                          {(changedFiles?.length > 0 || isCommitPushRunning || isCommitPushDone || isCommitPushError) && (
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={isCommitPushRunning}
                              onClick={handleCommitPush}
                              title={isCommitPushError ? worktreeConfig?.commitPushLastError : undefined}
                              className={cn(
                                "w-full justify-start gap-2 text-xs",
                                isCommitPushDone
                                  ? "border-state-completed/50 text-state-completed opacity-75"
                                  : isCommitPushError
                                    ? "border-destructive/50 text-destructive opacity-75"
                                    : !isCommitPushRunning && "border-primary/60 text-primary",
                              )}
                            >
                              <span>
                                {isCommitPushRunning
                                  ? "Enviando…"
                                  : isCommitPushDone
                                    ? "✓ Enviado"
                                    : isCommitPushError
                                      ? "↺ Tentar"
                                      : "Commit & Push"}
                              </span>
                            </Button>
                          )}
                          {isCommitPushDone && (
                            <div className="flex flex-col gap-1">
                              <CopyCmd
                                cmd={`git checkout ${worktreeConfig.branch}`}
                              />
                              <CopyCmd cmd={`git fetch origin`} />
                              <CopyCmd
                                cmd={`git reset --hard origin/${worktreeConfig.branch}`}
                              />
                              <CopyCmd cmd="git reset --soft HEAD~1" />
                              <CopyCmd cmd="git reset" />
                              <CopyCmd cmd="git add ." />
                              <CopyCmd cmd='git commit -m "message"' />
                              <CopyCmd
                                cmd={`git push --force-with-lease origin ${worktreeConfig.branch}`}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <SidebarLabel>Assignees</SidebarLabel>
                {item.assignees.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {item.assignees.map((a) => (
                      <span key={a} className="text-xs text-muted-foreground">
                        @{a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs italic text-muted-foreground">
                    Nenhum
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <SidebarLabel>Labels</SidebarLabel>
                {item.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
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
                ) : (
                  <span className="text-xs italic text-muted-foreground">
                    Nenhum
                  </span>
                )}
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
      </Dialog>
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
    </>
  );
}
