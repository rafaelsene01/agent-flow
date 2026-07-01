"use client";

import { useEffect, useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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

  function install() {
    setInstalling(true);
    setError(null);
    fetch("/api/status/install-skill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: skill.name }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        onInstalled();
      })
      .catch((err) => setError(err.message || t("skill.installError")))
      .finally(() => setInstalling(false));
  }

  if (skill.installed) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-state-completed">
        <Check className="size-3.5" /> {t("skill.installed")}
      </span>
    );
  }
  if (!skill.installable) return null;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        variant="outline"
        size="xs"
        type="button"
        disabled={installing}
        onClick={install}
      >
        {installing ? "…" : t("skill.install")}
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

  return (
    <div className="flex flex-1 flex-col min-h-0 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{t("skill.title")}</h1>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t("skill.subtitle")}</p>

      {skills === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{t("skill.loadError")}</p>
      ) : skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("skill.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {skills.map((s) => (
            <li
              key={s.name}
              className="flex items-start gap-3 rounded-lg border bg-card/40 p-3"
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
                  <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                    {s.description}
                  </span>
                )}
              </label>
              <InstallControl skill={s} onInstalled={load} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
