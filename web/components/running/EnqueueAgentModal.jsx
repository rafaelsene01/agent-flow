"use client";

import { useEffect, useState } from "react";
import { Bot, GitBranch, GripVertical, ArrowUp, ArrowDown, X, Hand, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18nContext";

// Cada passo da pipeline recebe um id próprio (gerado aqui) que vira o id do run.
function newStepId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Monta uma pipeline ordenada de agentes na worktree já configurada do card.
 * Não escolhe branch: reusa o que foi definido em "Configurar Branch". Cada passo
 * roda só quando o anterior terminou `done` (fila com dependência).
 */
export default function EnqueueAgentModal({ board, item, worktree, onClose, onEnqueued }) {
  const { t } = useI18n();
  const [agents, setAgents] = useState(null);
  const [steps, setSteps] = useState([]); // [{ id, agentId, name, model, effort }]
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => setAgents([]));
  }, []);

  function toggleAgent(agent, checked) {
    setError(null);
    if (checked) {
      setSteps((prev) => [
        ...prev,
        { id: newStepId(), agentId: agent.id, name: agent.name, model: agent.model || "sonnet", effort: agent.effort || "medium" },
      ]);
    } else {
      setSteps((prev) => prev.filter((s) => s.agentId !== agent.id));
    }
  }

  function patchStep(id, patch) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  // Ponto de parada: passo que não roda no Claude, só destrava o próximo quando
  // o usuário o aprova manualmente na tela de execução. Pode haver vários.
  function addBreakpoint() {
    setError(null);
    setSteps((prev) => [...prev, { id: newStepId(), kind: "breakpoint" }]);
  }

  function move(index, dir) {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // Move o passo `from` para a posição `to`, preservando a ordem dos demais.
  function reorder(from, to) {
    setSteps((prev) => {
      if (from === to || from == null || to == null) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function handleDrop() {
    if (dragIndex != null && overIndex != null) reorder(dragIndex, overIndex);
    setDragIndex(null);
    setOverIndex(null);
  }

  async function handleEnqueue() {
    if (steps.length === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-runs/chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worktreeId: worktree.id,
          title: item.title,
          body: item.body,
          steps: steps.map((s) =>
            s.kind === "breakpoint"
              ? { id: s.id, kind: "breakpoint" }
              : { id: s.id, agentId: s.agentId, model: s.model, effort: s.effort },
          ),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onEnqueued?.(data.runs);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const selectedIds = new Set(steps.map((s) => s.agentId));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="sm:max-w-[1400px] p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex-row items-center justify-between gap-2 border-b px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground shrink-0" />
            <DialogTitle className="text-sm font-semibold leading-none">
              {item.number != null && (
                <span className="font-mono text-muted-foreground mr-1.5">#{item.number}</span>
              )}
              {t("running.launch.title")}
            </DialogTitle>
          </div>
          <Button variant="ghost" size="icon-xs" type="button" onClick={onClose} aria-label={t("running.close")}>
            ✕
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Worktree/branch reusada (somente leitura) */}
          <div className="flex items-center gap-2 bg-muted/50 border rounded-lg px-3 py-2">
            <GitBranch className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground truncate">{worktree.originBranch}</span>
            <span className="text-xs font-mono font-medium truncate">→ {worktree.branch}</span>
          </div>

          {/* Seleção de agentes */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("running.launch.agents")}
            </Label>
            {agents === null ? (
              <p className="text-xs text-muted-foreground">…</p>
            ) : agents.length === 0 ? (
              <p className="text-xs text-destructive">{t("running.launch.noAgents")}</p>
            ) : (
              <div className="border rounded-lg bg-muted/40 p-1 max-h-36 overflow-y-auto flex flex-col gap-0.5">
                {agents.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs cursor-pointer hover:bg-background transition"
                  >
                    <Checkbox
                      checked={selectedIds.has(a.id)}
                      onCheckedChange={(v) => toggleAgent(a, v === true)}
                    />
                    <span className="truncate">{a.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Pipeline ordenada */}
          {steps.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  {t("running.launch.order")}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={addBreakpoint}
                >
                  <Plus className="size-3" />
                  {t("running.launch.addBreakpoint")}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("running.launch.orderHint")}</p>
              <div className="flex flex-col gap-1.5">
                {steps.map((s, i) => (
                  <div
                    key={s.id}
                    onDragOver={(e) => {
                      if (dragIndex == null) return;
                      e.preventDefault();
                      if (overIndex !== i) setOverIndex(i);
                    }}
                    onDrop={handleDrop}
                    className={cn(
                      "flex items-center gap-2 border rounded-lg bg-card/50 px-2.5 py-2 transition-colors",
                      dragIndex === i && "opacity-50",
                      dragIndex != null && overIndex === i && dragIndex !== i && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <span
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                      aria-label={t("running.launch.drag")}
                      className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="size-3.5" />
                    </span>
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    {s.kind === "breakpoint" ? (
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <Hand className="size-3.5 shrink-0" />
                        <span className="truncate">{t("running.launch.breakpoint")}</span>
                      </span>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{s.name}</span>
                        <Select value={s.model} onValueChange={(v) => patchStep(s.id, { model: v })}>
                          <SelectTrigger size="sm" className="h-7 w-[92px] text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="haiku">Haiku</SelectItem>
                            <SelectItem value="sonnet">Sonnet</SelectItem>
                            <SelectItem value="opus">Opus</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={s.effort} onValueChange={(v) => patchStep(s.id, { effort: v })}>
                          <SelectTrigger size="sm" className="h-7 w-[86px] text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">low</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="high">high</SelectItem>
                          </SelectContent>
                        </Select>
                      </>
                    )}
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label={t("running.launch.moveUp")}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === steps.length - 1}
                        aria-label={t("running.launch.moveDown")}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSteps((prev) => prev.filter((x) => x.id !== s.id))}
                      aria-label={t("running.launch.remove")}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5 shrink-0">
          <Button variant="secondary" type="button" onClick={onClose}>
            {t("running.launch.cancel")}
          </Button>
          <Button type="button" disabled={steps.length === 0 || sending} onClick={handleEnqueue}>
            {sending
              ? t("running.launch.enqueuing")
              : `${t("running.launch.enqueue")}${steps.length > 0 ? ` (${steps.length})` : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
