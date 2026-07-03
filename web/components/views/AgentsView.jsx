"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Plus,
  FileText,
  Pencil,
  Trash2,
  Lock,
  Sparkles,
  Loader2,
  Send,
  User,
  ArrowLeft,
} from "lucide-react";
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

// Trunca texto longo (ex.: descrição de skill na lista de seleção) em `max`
// caracteres, cortando na última palavra completa para não quebrar no meio.
function truncate(text, max) {
  if (!text || text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}

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
                      {a.isDefault && (
                        <Badge variant="outline" className="gap-1 border-primary/20 text-primary">
                          <Lock className="size-2.5" />
                          {t("agents.default")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {!a.isDefault && (
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
                    )}
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
                    {!a.isDefault && (
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
                    )}
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

  // Modo "ai": entrevista com o Claude para gerar o texto do prompt (mesmo
  // padrão do SkillCreatorModal). Ao concluir, preenche `prompt` e volta a "form".
  const [mode, setMode] = useState("form"); // "form" | "ai"
  const [aiSessionId] = useState(() => crypto.randomUUID());
  const [aiStarted, setAiStarted] = useState(false);
  const [aiModel, setAiModel] = useState("sonnet");
  const [aiEffort, setAiEffort] = useState("medium");
  const [aiThread, setAiThread] = useState([]);
  const [aiDraft, setAiDraft] = useState("");
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState(null);

  const lastAiQuestion = [...aiThread].reverse().find((m) => m.role === "assistant");
  const aiOptions = lastAiQuestion?.options ?? [];

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

  async function sendAiMessage() {
    const text = aiDraft.trim();
    if (!text || aiPending) return;
    setAiError(null);
    setAiThread((prev) => [...prev, { role: "user", text }]);
    setAiDraft("");
    setAiPending(true);
    try {
      const res = await fetch("/api/agents/create/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: aiSessionId,
          prompt: text,
          started: aiStarted,
          model: aiModel,
          effort: aiEffort,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiStarted(true);
      if (data.type === "complete") {
        // IA concluiu: preenche o prompt e volta para o formulário.
        setPrompt(data.content ?? "");
        setMode("form");
      } else {
        setAiThread((prev) => [
          ...prev,
          { role: "assistant", question: data.question, options: data.options ?? [] },
        ]);
      }
    } catch (err) {
      // Devolve o rascunho e remove o balão do usuário para reenviar.
      setAiError(err.message);
      setAiDraft(text);
      setAiThread((prev) => prev.slice(0, -1));
    } finally {
      setAiPending(false);
    }
  }

  function pickAiOption(opt) {
    setAiDraft((d) => (d.trim() ? `${d.trim()} ${opt}` : opt));
  }

  function onAiKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendAiMessage();
    }
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
        <DialogHeader className={mode === "ai" ? "flex-row items-center gap-2 space-y-0" : undefined}>
          {mode === "ai" ? (
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              onClick={() => { setMode("form"); setAiError(null); }}
              aria-label="Voltar"
              title="Voltar ao formulário"
            >
              <ArrowLeft className="size-4" />
            </Button>
          ) : null}
          <DialogTitle className="flex items-center gap-2 text-base">
            {mode === "ai" ? (
              <Sparkles className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Bot className="size-4 shrink-0" />
            )}
            {mode === "ai" ? "Gerar prompt com IA" : t(isEdit ? "agents.editTitle" : "agents.new")}
          </DialogTitle>
        </DialogHeader>

        {mode === "form" ? (
          <>
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
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="agent-prompt">{t("agents.prompt")}</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => { setMode("ai"); setAiError(null); }}
                    className="h-6 gap-1 px-2 text-xs"
                  >
                    <Sparkles className="size-3" />
                    Gerar com IA
                  </Button>
                </div>
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
                              {truncate(s.description, 200)}
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
          </>
        ) : (
          /* ── Fluxo de IA: entrevista para gerar o prompt do agent ── */
          <>
            <div className="min-h-0 flex-1 overflow-auto py-4 flex flex-col gap-4">
              {aiThread.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Descreva o agent que você quer criar. Vou fazer algumas perguntas e,
                  ao final, gerar o prompt para você revisar.
                </p>
              )}
              {aiThread.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex items-start gap-2 self-end max-w-[85%]">
                    <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm whitespace-pre-wrap">
                      {m.text}
                    </div>
                    <User className="size-4 mt-2 shrink-0 text-muted-foreground" />
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-2 max-w-[85%]">
                    <Sparkles className="size-4 mt-2 shrink-0 text-muted-foreground" />
                    <div className="rounded-lg bg-muted/50 border px-3 py-2 text-sm whitespace-pre-wrap">
                      {m.question}
                    </div>
                  </div>
                )
              )}
              {aiPending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Claude está pensando…
                </div>
              )}
              {aiError && <p className="text-xs text-destructive">⚠ {aiError}</p>}
            </div>

            <div className="border-t pt-3.5 shrink-0 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Select value={aiModel} onValueChange={setAiModel} disabled={aiPending}>
                  <SelectTrigger size="sm" className="h-7 w-auto gap-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="haiku">Haiku</SelectItem>
                    <SelectItem value="sonnet">Sonnet</SelectItem>
                    <SelectItem value="opus">Opus</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={aiEffort} onValueChange={setAiEffort} disabled={aiPending}>
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
              </div>
              {aiOptions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {aiOptions.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickAiOption(opt)}
                      disabled={aiPending}
                      className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-50"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <Textarea
                  value={aiDraft}
                  onChange={(e) => setAiDraft(e.target.value)}
                  onKeyDown={onAiKeyDown}
                  disabled={aiPending}
                  placeholder={aiStarted ? "Sua resposta… (Enter envia, Shift+Enter quebra linha)" : "Descreva o agent que você quer criar…"}
                  className="min-h-[44px] max-h-40 resize-none text-sm"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  onClick={sendAiMessage}
                  disabled={aiPending || !aiDraft.trim()}
                  className="gap-1.5 shrink-0"
                >
                  {aiPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {aiStarted ? "Enviar" : "Iniciar"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
