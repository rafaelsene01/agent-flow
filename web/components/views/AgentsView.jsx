"use client";

import { useEffect, useState } from "react";
import { Bot, Plus, FileText, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18nContext";
import { useToast } from "@/lib/toast";

// Accent por modelo — dá identidade visual ao badge sem depender de cor crua nos
// componentes; usa tints com contraste testado em light/dark.
const MODEL_BADGE = {
  opus: "border-transparent bg-primary/12 text-primary",
  sonnet: "border-transparent bg-blue-500/12 text-blue-600 dark:text-blue-400",
  haiku: "border-transparent bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
};

/**
 * Tela "/agent": cria e lista agents. Cada agent tem nome, prompt e skills
 * linkadas (por nome). O botão "Ver prompt" chama /api/agents/:id/prompt, que
 * monta o prompt final (skills ativas + prompt do agent + skills linkadas, sem
 * duplicar as que já estão ativas).
 */
export default function AgentsView() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [agents, setAgents] = useState(null); // null = carregando
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // null | agent em edição
  const [promptView, setPromptView] = useState(null); // { name, prompt } | "loading"
  const [confirmDelete, setConfirmDelete] = useState(null); // agent a excluir
  const [deleting, setDeleting] = useState(false);
  // Skills globais (ativas) — omitidas dos badges do agent, pois já se aplicam
  // globalmente e não são específicas do agent (mesma dedup do buildAgentPrompt).
  const [activeSkills, setActiveSkills] = useState(() => new Set());

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => { if (!r.ok) throw new Error("load"); return r.json(); })
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => { setError(true); setAgents([]); });
    fetch("/api/skills")
      .then((r) => r.json())
      .then((d) => setActiveSkills(new Set((d.skills ?? []).filter((s) => s.active).map((s) => s.name))))
      .catch(() => {});
  }, []);

  async function viewPrompt(agent) {
    setPromptView("loading");
    try {
      const res = await fetch(`/api/agents/${agent.id}/prompt`);
      if (!res.ok) throw new Error("prompt");
      const d = await res.json();
      setPromptView({ name: agent.name, prompt: d.prompt });
    } catch {
      setPromptView(null);
      toast({ title: t("agents.promptError"), variant: "error" });
    }
  }

  async function handleDelete() {
    const id = confirmDelete?.id;
    if (!id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAgents(data.agents ?? []);
      setConfirmDelete(null);
    } catch {
      toast({ title: t("agents.deleteError"), variant: "error" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{t("agents.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("agents.subtitle")}</p>
          </div>
        </div>
        <Button type="button" size="sm" className="shrink-0" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {t("agents.new")}
        </Button>
      </div>

      {agents === null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{t("agents.loadError")}</p>
      ) : agents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Bot className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t("agents.empty")}</p>
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t("agents.new")}
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {agents.map((a) => {
            const skills = (a.skills ?? []).filter((s) => !activeSkills.has(s));
            return (
              <li
                key={a.id}
                className="group flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-card transition-all duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card-hover"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10">
                    <Bot className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.name}</span>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {a.model && (
                        <Badge className={MODEL_BADGE[a.model] ?? "border-transparent bg-muted text-muted-foreground"}>
                          {a.model}
                        </Badge>
                      )}
                      {a.effort && <Badge variant="outline">{a.effort}</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => setEditing(a)}
                      title={t("agents.edit")}
                      aria-label={t("agents.edit")}
                      className="text-muted-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => viewPrompt(a)}
                      title={t("agents.viewPrompt")}
                      aria-label={t("agents.viewPrompt")}
                      className="text-muted-foreground"
                    >
                      <FileText className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => setConfirmDelete(a)}
                      title={t("agents.delete")}
                      aria-label={t("agents.delete")}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="line-clamp-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{a.prompt}</p>
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skills.map((s) => (
                      <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {creating && (
        <AgentDialog
          onClose={() => setCreating(false)}
          onSaved={(list) => { setAgents(list); setCreating(false); }}
        />
      )}

      {editing && (
        <AgentDialog
          agent={editing}
          onClose={() => setEditing(null)}
          onSaved={(list) => { setAgents(list); setEditing(null); }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={t("agents.delete")}
        targetName={confirmDelete?.name}
        description={deleting ? t("agents.deleting") : t("agents.deleteConfirm")}
        destructive
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
        onConfirm={handleDelete}
      />

      <Dialog open={!!promptView} onOpenChange={(o) => { if (!o) setPromptView(null); }}>
        <DialogContent className="max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4 shrink-0" />
              {promptView && promptView !== "loading"
                ? t("agents.promptTitle").replace("{name}", promptView.name)
                : t("agents.viewPrompt")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {promptView === "loading" ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono text-xs">
                {promptView?.prompt}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => setPromptView(null)}>
              {t("action.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Dialog de criar/editar agent. Com `agent` → modo edição (PUT, campos pré-preenchidos);
// sem `agent` → modo criação (POST).
function AgentDialog({ agent, onClose, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const isEdit = !!agent;
  const [name, setName] = useState(agent?.name ?? "");
  const [prompt, setPrompt] = useState(agent?.prompt ?? "");
  const [model, setModel] = useState(agent?.model ?? "sonnet");
  const [effort, setEffort] = useState(agent?.effort ?? "medium");
  const [skills, setSkills] = useState(null); // null = carregando
  const [selected, setSelected] = useState(() => new Set(agent?.skills ?? []));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Skills ativas globalmente ficam de fora da seleção — já se aplicam a todo
    // agent e são injetadas no prompt pelo bloco global, não pelo link do agent.
    fetch("/api/skills")
      .then((r) => r.json())
      .then((d) => setSkills((d.skills ?? []).filter((s) => !s.active)))
      .catch(() => setSkills([]));
  }, []);

  function toggle(skillName, on) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(skillName); else next.delete(skillName);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/agents/${agent.id}` : "/api/agents", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prompt, model, effort, skills: [...selected] }),
      });
      if (!res.ok) throw new Error("save");
      const d = await res.json();
      onSaved(d.agents ?? []);
    } catch {
      setSaving(false);
      toast({ title: t(isEdit ? "agents.saveError" : "agents.createError"), variant: "error" });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[560px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4 shrink-0" />
            {t(isEdit ? "agents.editTitle" : "agents.new")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-name">{t("agents.name")}</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("agents.namePlaceholder")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-prompt">{t("agents.prompt")}</Label>
            <Textarea
              id="agent-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("agents.promptPlaceholder")}
              className="min-h-32"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>{t("card.model")}</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="haiku">Haiku</SelectItem>
                  <SelectItem value="sonnet">Sonnet</SelectItem>
                  <SelectItem value="opus">Opus</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>{t("card.effort")}</Label>
              <Select value={effort} onValueChange={setEffort}>
                <SelectTrigger>
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("agents.skills")}</Label>
            {skills === null ? (
              <Skeleton className="h-14 w-full" />
            ) : skills.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("agents.noSkills")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5 max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-2">
                {skills.map((s) => (
                  <li key={s.name} className="flex items-start gap-2.5">
                    <Checkbox
                      id={`agent-skill-${s.name}`}
                      checked={selected.has(s.name)}
                      onCheckedChange={(v) => toggle(s.name, v === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor={`agent-skill-${s.name}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block text-sm font-medium">{s.name}</span>
                      {s.description && (
                        <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-1">
                          {s.description}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="secondary" type="button" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || !prompt.trim() || saving}
            onClick={save}
          >
            {saving
              ? t(isEdit ? "agents.saving" : "agents.creating")
              : t(isEdit ? "agents.save" : "agents.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
