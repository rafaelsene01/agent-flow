"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import CreateBranchModal from "@/components/CreateBranchModal.jsx";
import CopyCmd from "@/components/board/CopyCmd.jsx";
import TlcFileModal from "@/components/board/TlcFileModal.jsx";

const TYPE_LABEL = {
  Issue: "Issue",
  PullRequest: "Pull request",
  DraftIssue: "Draft issue",
};

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

  useEffect(() => {
    function onKey(e) {
      // Esc fecha apenas o modal em evidência: se um modal filho (branch ou
      // spec/design/tasks) está aberto, ele é quem trata o Esc.
      if (e.key === "Escape" && !showCreateBranch && !tlcFileModal) onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, showCreateBranch, tlcFileModal]);

  const isConfigured = !!worktreeConfig;
  const isChecking = worktreeConfig === null && worktreeId !== null;

  const [specSending, setSpecSending] = useState(false);
  const [tlcSending, setTlcSending] = useState(false);
  const [tlcExecSending, setTlcExecSending] = useState(false);
  const [cleanupSending, setCleanupSending] = useState(false);
  const [commitPushSending, setCommitPushSending] = useState(false);
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [tlcFiles, setTlcFiles] = useState(null); // { spec, design, tasks } from live scan

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setClaudeStatus(d.claude ?? null))
      .catch(() => setClaudeStatus(null));
  }, []);

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

  async function handleCleanup() {
    setCleanupSending(true);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/cleanup`,
        { method: "POST" },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadWorktreeConfig();
    } catch (err) {
      console.error("[cleanup]", err);
    } finally {
      setCleanupSending(false);
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
      <div className="backdrop">
        <div className="modal card-modal">
          <div className="card-modal-layout">
            {/* ── main ── */}
            <div className="card-modal-main">
              <div className="card-modal-fixed">
                <div className="card-modal-header">
                  <div className="card-modal-header-left">
                    {item.number != null && (
                      <span className="modal-id">#{item.number}</span>
                    )}
                  </div>
                  <button className="modal-close" onClick={onClose}>
                    ✕
                  </button>
                </div>
                <h2 className="modal-title card-modal-title">{item.title}</h2>
                <div className="card-modal-divider" />
                <div className="card-modal-desc-label">Descrição</div>
              </div>
              <div className="card-modal-scroll">
                {item.body ? (
                  <div className="card-modal-body md">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[[rehypeHighlight, { detect: false }]]}
                    >
                      {item.body}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="card-modal-no-body">Sem descrição.</p>
                )}
              </div>
            </div>

            {/* ── sidebar ── */}
            <aside className="card-modal-sidebar">
              <div className="sidebar-section">
                <span className="sidebar-label">Gatilhos</span>
                <div className="sidebar-triggers">
                  <div className="trigger-item-row">
                    <button
                      className={`trigger-item${isConfigured ? " trigger-item--done" : ""}`}
                      type="button"
                      disabled={isConfigured || isChecking}
                      onClick={() => setShowCreateBranch(true)}
                    >
                      <span className="trigger-icon">⎇</span>
                      <span className="trigger-label">Configurar Branch</span>
                      <span className="trigger-run">
                        {isConfigured ? "✓" : "▷"}
                      </span>
                    </button>
                    {isConfigured && (
                      <button
                        className="trigger-reset"
                        type="button"
                        title="Resetar: remove a worktree do disco e limpa a configuração do card"
                        onClick={handleResetWorktree}
                      >
                        ↺
                      </button>
                    )}
                  </div>
                  {isConfigured && (
                    <div className="worktree-info">
                      <span className="worktree-info-branch">
                        ⎇ {worktreeConfig.branch}
                      </span>
                      <span
                        className="worktree-info-path"
                        title={worktreeConfig.path}
                      >
                        {worktreeConfig.path}
                      </span>
                    </div>
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
                        <button
                          className={`trigger-item${isDone ? " trigger-item--done" : isError ? " trigger-item--error" : ""}`}
                          type="button"
                          disabled={!isConfigured || isRunning || isTlcRunning}
                          onClick={handleRunSpec}
                        >
                          <span className="trigger-icon">✎</span>
                          <span className="trigger-label">Executar Tarefa</span>
                          <span className="trigger-run">
                            {isRunning
                              ? "…"
                              : isDone
                                ? "✓"
                                : isError
                                  ? "↺"
                                  : "▷"}
                          </span>
                        </button>
                        {isRunning && (
                          <span className="trigger-feedback trigger-feedback--running">
                            ⟳ Executando em background…
                          </span>
                        )}
                        {isDone && (
                          <span className="trigger-feedback ok">
                            ✓ Concluído · clique para re-executar
                          </span>
                        )}
                        {isError && worktreeConfig?.lastError && (
                          <span
                            className="trigger-feedback err"
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
                        <button
                          className={`trigger-item${isTlcDone ? " trigger-item--done" : isTlcError ? " trigger-item--error" : ""}`}
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
                        >
                          <span className="trigger-icon">⚡</span>
                          <span className="trigger-label">Executar TLC</span>
                          <span className="trigger-run">
                            {isTlcRunning
                              ? "…"
                              : isTlcDone
                                ? "✓"
                                : isTlcError
                                  ? "↺"
                                  : "▷"}
                          </span>
                        </button>
                        {isTlcRunning && (
                          <span className="trigger-feedback trigger-feedback--running">
                            ⟳ Criando spec, design e tasks…
                          </span>
                        )}
                        {isTlcError && worktreeConfig?.tlcLastError && (
                          <span
                            className="trigger-feedback err"
                            title={worktreeConfig.tlcLastError}
                          >
                            ✕ {worktreeConfig.tlcLastError}
                          </span>
                        )}
                        {isTlcDone && (
                          <>
                            <div className="tlc-outputs">
                              {[
                                { type: "spec", icon: "📋", label: "Spec" },
                                { type: "design", icon: "🎨", label: "Design" },
                                { type: "tasks", icon: "✅", label: "Tasks" },
                              ].map(({ type, icon, label }) => {
                                const exists = tlcFiles?.[type] ?? false;
                                return (
                                  <button
                                    key={type}
                                    className={`tlc-output-btn${exists ? " tlc-output-btn--active" : ""}`}
                                    type="button"
                                    disabled={!exists}
                                    title={
                                      !exists
                                        ? `${label} não foi gerado`
                                        : `Abrir ${label}`
                                    }
                                    onClick={() => setTlcFileModal(type)}
                                  >
                                    <span className="tlc-output-icon">
                                      {icon}
                                    </span>
                                    <span>{label}</span>
                                  </button>
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
                                  <button
                                    className={`trigger-item${isExecDone ? " trigger-item--done" : isExecError ? " trigger-item--error" : ""}`}
                                    type="button"
                                    disabled={isExecRunning}
                                    onClick={handleRunTlcExec}
                                  >
                                    <span className="trigger-icon">▶</span>
                                    <span className="trigger-label">
                                      Executar Spec
                                    </span>
                                    <span className="trigger-run">
                                      {isExecRunning
                                        ? "…"
                                        : isExecDone
                                          ? "✓"
                                          : isExecError
                                            ? "↺"
                                            : "▷"}
                                    </span>
                                  </button>
                                  {isExecRunning && (
                                    <span className="trigger-feedback trigger-feedback--running">
                                      ⟳ Implementando, commitando e fazendo
                                      push…
                                    </span>
                                  )}
                                  {isExecDone && (
                                    <span className="trigger-feedback ok">
                                      ✓ Concluído · clique para re-executar
                                    </span>
                                  )}
                                  {isExecError &&
                                    worktreeConfig?.tlcExecLastError && (
                                      <span
                                        className="trigger-feedback err"
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
                      const cleanupDone = worktreeConfig?.cleanupDone === true;
                      const commitPushStatus = worktreeConfig?.commitPushStatus;
                      const isCommitPushRunning =
                        commitPushStatus === "running" || commitPushSending;
                      const isCommitPushDone = commitPushStatus === "done";
                      const isCommitPushError = commitPushStatus === "error";
                      return (
                        <div className="trigger-action-row">
                          <button
                            className={`trigger-action-btn${cleanupDone ? " trigger-action-btn--done" : ""}`}
                            type="button"
                            disabled={cleanupSending}
                            onClick={handleCleanup}
                          >
                            <span className="trigger-icon">🧹</span>
                            <span>
                              {cleanupSending
                                ? "Limpando…"
                                : cleanupDone
                                  ? "✓ Limpo"
                                  : "Limpar"}
                            </span>
                          </button>
                          <CopyCmd cmd={`cd ${worktreeConfig.path}`} />
                          <button
                            className={`trigger-action-btn trigger-action-btn--push${isCommitPushDone ? " trigger-action-btn--done" : isCommitPushError ? " trigger-action-btn--error" : ""}`}
                            type="button"
                            disabled={!cleanupDone || isCommitPushRunning}
                            onClick={handleCommitPush}
                            title={
                              !cleanupDone
                                ? "Execute a limpeza antes de commitar"
                                : isCommitPushError
                                  ? worktreeConfig?.commitPushLastError
                                  : undefined
                            }
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
                          </button>
                          {isCommitPushDone && (
                            <div className="git-cmds">
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

              <div className="sidebar-section">
                <span className="sidebar-label">Assignees</span>
                {item.assignees.length > 0 ? (
                  <div className="sidebar-assignees">
                    {item.assignees.map((a) => (
                      <span key={a} className="sidebar-assignee">
                        @{a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="sidebar-empty">Nenhum</span>
                )}
              </div>

              <div className="sidebar-section">
                <span className="sidebar-label">Labels</span>
                {item.labels.length > 0 ? (
                  <div className="sidebar-labels">
                    {item.labels.map((l) => (
                      <span
                        key={l.name}
                        className="label-chip"
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
                  <span className="sidebar-empty">Nenhum</span>
                )}
              </div>

              {item.itemType && (
                <div className="sidebar-section">
                  <span className="sidebar-label">Tipo</span>
                  <span className="sidebar-value">{item.itemType}</span>
                </div>
              )}
              {!item.itemType && item.type !== "Issue" && (
                <div className="sidebar-section">
                  <span className="sidebar-label">Tipo</span>
                  <span className="sidebar-value">
                    {TYPE_LABEL[item.type] ?? item.type}
                  </span>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
      {showCreateBranch && board && (
        <CreateBranchModal
          board={board}
          item={item}
          onClose={() => {
            setShowCreateBranch(false);
            loadWorktreeConfig();
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
    </>
  );
}
