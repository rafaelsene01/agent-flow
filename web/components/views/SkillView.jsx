"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18nContext";
import { useToast } from "@/lib/toast";

/**
 * Tela "/skill": lista as skills instaladas em ~/.claude/skills e permite ativar/
 * desativar cada uma via checkbox. O estado ativo é persistido no backend
 * (config.json → activeSkills) e será consumido futuramente na montagem de prompts.
 */
export default function SkillView() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [skills, setSkills] = useState(null); // null = carregando
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/skills")
      .then((r) => { if (!r.ok) throw new Error("load"); return r.json(); })
      .then((d) => setSkills(d.skills ?? []))
      .catch(() => { setError(true); setSkills([]); });
  }, []);

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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
