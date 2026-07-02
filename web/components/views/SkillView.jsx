"use client";

import { useEffect, useState } from "react";
import { Sparkles, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import SkillCreatorModal from "@/components/skill/SkillCreatorModal";
import FileContentModal from "@/components/board/FileContentModal";
import { useI18n } from "@/lib/i18nContext";
import { useToast } from "@/lib/toast";

/**
 * Controle de instalação global de uma skill: mostra "Instalada" quando já
 * presente em ~/.claude, ou um botão "Instalar" quando instalável mas ausente.
 * Skills sem catálogo de instalação (installable: false) não renderizam nada.
 */
function InstallControl({ skill, onInstalled }) {
  const { t } = useI18n();
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState(null);

  function install(force = false) {
    setInstalling(true);
    setError(null);
    fetch("/api/status/install-skill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: skill.name, force }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        onInstalled();
      })
      .catch((err) => setError(err.message || t("skill.installError")))
      .finally(() => setInstalling(false));
  }

  if (!skill.installable) return null;

  // Ausente no global → "Instalar". Instalada e diferente da versão do projeto →
  // "Atualizar" (substitui). Instalada e idêntica → "Atualizar" desabilitado
  // (nada a fazer). Sempre um único botão, sem selo "Instalada".
  const upToDate = skill.installed && skill.upToDate;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        variant="outline"
        size="xs"
        type="button"
        disabled={installing || upToDate}
        onClick={() => install(skill.installed)}
        title={
          upToDate
            ? "A versão global já está idêntica à do projeto"
            : skill.installed
              ? "Substituir a skill no Claude global"
              : "Adicionar a skill no Claude global"
        }
      >
        {installing
          ? "…"
          : skill.installed
            ? <><RefreshCw className="size-3" /> Atualizar</>
            : t("skill.install")}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

/**
 * Tela "/skill": lista as skills de .claude/skills. Cada card permite ativar/
 * desativar a skill (persistido em config.json → activeSkills) e, quando a skill
 * é instalável globalmente, mostra se já está instalada em ~/.claude ou oferece
 * o botão de instalar.
 */
export default function SkillView() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [skills, setSkills] = useState(null); // null = carregando
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // skill em edição
  const [confirmDelete, setConfirmDelete] = useState(null); // skill a excluir
  const [deleting, setDeleting] = useState(false);

  function load() {
    fetch("/api/skills")
      .then((r) => { if (!r.ok) throw new Error("load"); return r.json(); })
      .then((d) => setSkills(d.skills ?? []))
      .catch(() => { setError(true); setSkills([]); });
  }

  useEffect(() => { load(); }, []);

  const toggle = async (name, active) => {
    // Atualização otimista; reverte em caso de erro.
    setSkills((prev) => prev.map((s) => s.name === name ? { ...s, active } : s));
    try {
      const res = await fetch("/api/skills/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, active }),
      });
      if (!res.ok) throw new Error("toggle");
    } catch {
      setSkills((prev) => prev.map((s) => s.name === name ? { ...s, active: !active } : s));
      toast({ title: t("skill.toggleError"), variant: "error" });
    }
  };

  const handleDelete = async () => {
    const name = confirmDelete?.name;
    if (!name) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSkills(data.skills ?? []);
      setConfirmDelete(null);
    } catch (err) {
      toast({ title: err.message || "Erro ao excluir skill", variant: "error" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{t("skill.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("skill.subtitle")}</p>
          </div>
        </div>
        <Button
          size="sm"
          type="button"
          className="shrink-0"
          onClick={() => setCreating(true)}
        >
          <Plus className="size-4" />
          Criar skill
        </Button>
      </div>

      {skills === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{t("skill.loadError")}</p>
      ) : skills.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Sparkles className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t("skill.empty")}</p>
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Criar skill
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {skills.map((s) => (
            <li
              key={s.name}
              data-active={s.active || undefined}
              className="group flex items-start gap-3 rounded-xl border bg-card/50 p-3.5 shadow-card transition-all duration-200 hover:border-primary/30 hover:shadow-card-hover data-[active]:border-primary/40 data-[active]:bg-primary/[0.04]"
            >
              <Checkbox
                id={`skill-${s.name}`}
                checked={s.active}
                onCheckedChange={(v) => toggle(s.name, v === true)}
                className="mt-0.5"
              />
              <label htmlFor={`skill-${s.name}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-sm font-medium">{s.name}</span>
                {s.description && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {s.description}
                  </span>
                )}
              </label>
              <div className="flex shrink-0 items-center gap-1">
                <InstallControl skill={s} onInstalled={load} />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  type="button"
                  onClick={() => setEditing(s)}
                  title="Editar skill"
                  aria-label="Editar skill"
                  className="text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  type="button"
                  onClick={() => setConfirmDelete(s)}
                  title="Excluir skill"
                  aria-label="Excluir skill"
                  className="text-muted-foreground opacity-60 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <SkillCreatorModal
          onClose={() => setCreating(false)}
          onSaved={load}
        />
      )}

      {editing && (
        <FileContentModal
          filePath={`${editing.name}/SKILL.md`}
          fetchUrl={`/api/skills/${encodeURIComponent(editing.name)}/content`}
          onClose={() => { setEditing(null); load(); }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Excluir skill"
        targetName={confirmDelete?.name}
        description={deleting ? "Excluindo…" : "Remove a skill do projeto. Esta ação não pode ser desfeita."}
        destructive
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
        onConfirm={handleDelete}
      />
    </div>
  );
}
