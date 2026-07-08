"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import {
  MessageSquare,
  Loader2,
  Send,
  User,
  GitBranch,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as reposApi from "@/lib/api/repos.js";

/**
 * Chat do board: conversa com o Claude dentro de uma worktree criada a partir do
 * id do board, com checkout na branch selecionada — perguntas sobre o projeto são
 * respondidas usando os arquivos dessa worktree.
 *
 * Ao abrir, consulta GET /api/board-chat/<boardId>:
 * - se já existe chat → tela de escolha: continuar a conversa ou iniciar um novo
 *   (iniciar um novo apaga o registro antigo e a worktree no backend, ao enviar);
 * - se não existe → vai direto para o chat novo (branch, modelo, effort + input).
 */
export default function BoardChatModal({ board, onClose }) {
  const boardId = board.id;
  const repo = board.originRepo ?? "";
  const [owner, repoName] = repo.split("/");

  const [phase, setPhase] = useState("loading"); // "loading" | "choice" | "chat"
  const [existing, setExisting] = useState(null);

  const [started, setStarted] = useState(false);
  // thread: lista de { role: "user" | "assistant", text }
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  // polling: chat retomado com turno ainda em processamento no backend —
  // consulta o GET até o status sair de "running" para exibir a resposta.
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState(null);

  const [model, setModel] = useState("sonnet");
  const [effort, setEffort] = useState("medium");
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState(null);

  const scrollRef = useRef(null);

  // Busca no banco se já existe um chat registrado para este board.
  useEffect(() => {
    let active = true;
    fetch(`/api/board-chat/${encodeURIComponent(boardId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (data.error) throw new Error(data.error);
        if (data.chat) {
          setExisting(data.chat);
          setPhase("choice");
        } else {
          setPhase("chat");
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setPhase("chat");
      });
    return () => { active = false; };
  }, [boardId]);

  // Branches do repo — só para chat novo (antes do primeiro envio).
  useEffect(() => {
    if (phase !== "chat" || started || !owner || !repoName) return;
    let active = true;
    setBranchesLoading(true);
    setBranchesError(null);
    reposApi.listBranches(owner, repoName)
      .then((data) => {
        if (!active) return;
        if (data.error) throw new Error(data.error);
        setBranches(data.branches ?? []);
      })
      .catch((err) => { if (active) setBranchesError(err.message); })
      .finally(() => { if (active) setBranchesLoading(false); });
    return () => { active = false; };
  }, [phase, started, owner, repoName]);

  // Mantém a conversa rolada para o fim a cada mensagem nova.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread, pending]);

  // Acompanha um turno que já estava em processamento quando o modal reabriu.
  useEffect(() => {
    if (!polling) return;
    let active = true;
    const id = setInterval(() => {
      fetch(`/api/board-chat/${encodeURIComponent(boardId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (!active) return;
          if (!data.chat || data.chat.status !== "running") {
            if (data.chat) {
              setThread(data.chat.thread ?? []);
              if (data.chat.status === "error" && data.chat.error) setError(data.chat.error);
            }
            setPending(false);
            setPolling(false);
          }
        })
        .catch(() => { /* tenta de novo no próximo tick */ });
    }, 3000);
    return () => { active = false; clearInterval(id); };
  }, [polling, boardId]);

  function continueChat() {
    setThread(existing.thread ?? []);
    setModel(existing.model ?? "sonnet");
    setEffort(existing.effort ?? "medium");
    setBranch(existing.branch ?? "");
    setStarted(true);
    setPhase("chat");
    if (existing.status === "running") {
      // Turno ainda em processamento no backend: mostra o spinner e acompanha
      // via polling até a resposta chegar.
      setPending(true);
      setPolling(true);
    } else if (existing.status === "error" && existing.error) {
      setError(existing.error);
    }
  }

  function newChat() {
    setThread([]);
    setBranch("");
    setStarted(false);
    setPhase("chat");
  }

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    if (!started && !branch) {
      setError("Selecione a branch para o checkout da worktree.");
      return;
    }
    setError(null);
    setThread((t) => [...t, { role: "user", text }]);
    setDraft("");
    setPending(true);
    try {
      const url = started
        ? `/api/board-chat/${encodeURIComponent(boardId)}/message`
        : `/api/board-chat/${encodeURIComponent(boardId)}/start`;
      const body = started
        ? { prompt: text, model, effort }
        : { repo, branch, model, effort, prompt: text };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStarted(true);
      setThread((t) => [...t, { role: "assistant", text: data.text ?? "" }]);
    } catch (err) {
      // Devolve o rascunho e remove o balão do usuário para reenviar.
      setError(err.message);
      setDraft(text);
      setThread((t) => t.slice(0, -1));
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="w-full sm:max-w-[1400px] h-[85vh] flex flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* ── Header ── */}
        <DialogHeader className="flex-row items-center justify-between gap-2 border-b px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="size-4 text-muted-foreground shrink-0" />
            <DialogTitle className="text-sm font-semibold leading-none truncate">
              Chat · {board.name}
            </DialogTitle>
            {started && branch && (
              <span className="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground shrink-0">
                <GitBranch className="size-3" />
                {branch}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon-xs" type="button" onClick={onClose} aria-label="Fechar">
            ✕
          </Button>
        </DialogHeader>

        {phase === "loading" && (
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Verificando chat existente…
          </div>
        )}

        {phase === "choice" && (
          /* ── Já existe chat para este board: continuar ou começar do zero ── */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Já existe um chat para este board na branch{" "}
              <code className="font-mono text-xs bg-muted border rounded px-1">{existing?.branch}</code>
              {existing?.updatedAt && (
                <> (última atividade em {new Date(existing.updatedAt).toLocaleString()})</>
              )}
              .
            </p>
            {existing?.status === "running" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Uma resposta ainda está sendo processada — continue para acompanhar.
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button type="button" onClick={continueChat} className="gap-1.5">
                <Play className="size-4" />
                Continuar chat
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={newChat}
                disabled={existing?.status === "running"}
                className="gap-1.5"
              >
                <RotateCcw className="size-4" />
                Iniciar novo chat
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-md">
              Iniciar um novo chat apaga a conversa anterior e a worktree associada.
            </p>
          </div>
        )}

        {phase === "chat" && (
          <>
            {/* ── Conversa ── */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-5 py-4 flex flex-col gap-4">
              {!repo ? (
                <p className="text-sm text-destructive">
                  Nenhum repositório de origem configurado. Edite o board para definir um.
                </p>
              ) : thread.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Selecione a branch e envie a primeira mensagem. A worktree do board será
                  criada com checkout nessa branch e toda a conversa roda dentro dela —
                  perguntas sobre o projeto usam os arquivos da worktree como referência.
                </p>
              ) : null}
              {thread.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex items-start gap-2 self-end max-w-[85%]">
                    <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm whitespace-pre-wrap">
                      {m.text}
                    </div>
                    <User className="size-4 mt-2 shrink-0 text-muted-foreground" />
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-2 max-w-[85%]">
                    <MessageSquare className="size-4 mt-2 shrink-0 text-muted-foreground" />
                    <div className="rounded-lg bg-muted/50 border px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
                      >
                        {m.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                )
              )}
              {pending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {started ? "Claude está pensando…" : "Preparando worktree e pensando… (pode demorar)"}
                </div>
              )}
              {error && <p className="text-xs text-destructive">⚠ {error}</p>}
            </div>

            {/* ── Área de input fixada abaixo ── */}
            <div className="border-t px-5 py-3.5 shrink-0 flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={model} onValueChange={setModel} disabled={pending}>
                  <SelectTrigger size="sm" className="h-7 w-auto gap-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="haiku">Haiku</SelectItem>
                    <SelectItem value="sonnet">Sonnet</SelectItem>
                    <SelectItem value="opus">Opus</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={effort} onValueChange={setEffort} disabled={pending}>
                  <SelectTrigger size="sm" className="h-7 w-auto gap-1 text-xs">
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
                {!started && repo && (
                  <Select value={branch} onValueChange={setBranch} disabled={pending || branchesLoading}>
                    <SelectTrigger size="sm" className="h-7 w-auto max-w-64 gap-1 text-xs font-mono">
                      <GitBranch className="size-3 shrink-0" />
                      <SelectValue placeholder={branchesLoading ? "Carregando branches…" : "Selecione a branch"} />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.name} value={b.name} className="font-mono text-xs">
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {branchesError && <span className="text-xs text-destructive">{branchesError}</span>}
              </div>
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={pending || !repo}
                  placeholder={
                    started
                      ? "Sua mensagem… (Enter envia, Shift+Enter quebra linha)"
                      : "Sua primeira mensagem… (cria a worktree e inicia o chat)"
                  }
                  className="min-h-[44px] max-h-40 resize-none text-sm"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  onClick={send}
                  disabled={pending || !draft.trim() || !repo || (!started && !branch)}
                  className="gap-1.5 shrink-0"
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {started ? "Enviar" : "Iniciar"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
