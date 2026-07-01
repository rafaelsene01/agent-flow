"use client";

import { useEffect, useState } from "react";
import { Bot, Plus, FileText } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18nContext";
import { useToast } from "@/lib/toast";

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
  const [promptView, setPromptView] = useState(null); // { name, prompt } | "loading"
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

  return (
    <div className="flex flex-1 flex-col min-h-0 p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">{t("agents.title")}</h1>
        </div>
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {t("agents.new")}
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t("agents.subtitle")}</p>

      {agents === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{t("agents.loadError")}</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("agents.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {agents.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-lg border bg-card/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1 text-sm font-medium">{a.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => viewPrompt(a)}
                  className="shrink-0 text-muted-foreground"
                >
                  <FileText className="size-4" />
                  {t("agents.viewPrompt")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{a.prompt}</p>
              {(() => {
                const skills = (a.skills ?? []).filter((s) => !activeSkills.has(s));
                return skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skills.map((s) => (
                      <Badge key={s} variant="secondary">{s}</Badge>
                    ))}
                  </div>
                );
              })()}
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <CreateAgentDialog
          onClose={() => setCreating(false)}
          onCreated={(list) => { setAgents(list); setCreating(false); }}
        />
      )}

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

function CreateAgentDialog({ onClose, onCreated }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [skills, setSkills] = useState(null); // null = carregando
  const [selected, setSelected] = useState(() => new Set());
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
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prompt, skills: [...selected] }),
      });
      if (!res.ok) throw new Error("create");
      const d = await res.json();
      onCreated(d.agents ?? []);
    } catch {
      setSaving(false);
      toast({ title: t("agents.createError"), variant: "error" });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[560px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4 shrink-0" />
            {t("agents.new")}
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
            {saving ? t("agents.creating") : t("agents.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
