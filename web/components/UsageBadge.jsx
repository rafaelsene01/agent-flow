"use client";

import { useEffect, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function pctColor(pct) {
  if (pct >= 80) return "text-destructive";
  if (pct >= 50) return "text-yellow-500 dark:text-yellow-400";
  return "text-muted-foreground";
}

export default function UsageBadge() {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    let mounted = true;
    let retryTimer = null;

    async function load() {
      try {
        const res = await fetch("/api/usage");
        if (!res.ok) {
          // Servidor ainda aquecendo — tenta novamente em 15s
          if (mounted) retryTimer = setTimeout(load, 15_000);
          return;
        }
        const data = await res.json();
        if (mounted) setUsage(data);
      } catch {}
    }

    load();
    const id = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
      clearTimeout(retryTimer);
    };
  }, []);

  if (!usage?.session && !usage?.weekly) return null;

  return (
    <div className="flex items-center gap-0.5 text-xs font-mono">
      {usage.session && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("cursor-default tabular-nums px-0.5", pctColor(usage.session.pct))}>
              {usage.session.pct}%
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-semibold">Sessão atual</p>
            <p>Reset: {usage.session.reset}</p>
          </TooltipContent>
        </Tooltip>
      )}
      <span className="text-muted-foreground/40 select-none">/</span>
      {usage.weekly && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("cursor-default tabular-nums px-0.5", pctColor(usage.weekly.pct))}>
              {usage.weekly.pct}%
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-semibold">Semanal (todos os modelos)</p>
            <p>Reset: {usage.weekly.reset}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
