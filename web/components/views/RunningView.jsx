"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18nContext";
import RunModal from "@/components/running/RunModal.jsx";

const STATUS_CLASS = {
  queued: "",
  processing: "border-blue-400 text-blue-600 dark:text-blue-400",
  "waiting-input": "border-amber-400 text-amber-600 dark:text-amber-400",
  done: "border-emerald-400 text-emerald-600 dark:text-emerald-400",
  error: "",
};

function StatusBadge({ status }) {
  const { t } = useI18n();
  const variant = status === "error" ? "destructive" : "outline";
  return (
    <Badge variant={variant} className={STATUS_CLASS[status] ?? ""}>
      {t(`running.status.${status}`)}
    </Badge>
  );
}

/**
 * Tela "/running": lista todos os agent-runs (fila dedicada, separada do fluxo
 * antigo do board), com poll periódico para refletir mudanças de status ao vivo.
 */
export default function RunningView() {
  const { t } = useI18n();
  const [runs, setRuns] = useState(null); // null = carregando
  const [selectedId, setSelectedId] = useState(null);

  function load() {
    fetch("/api/agent-runs")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => setRuns((prev) => prev ?? []));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-1 flex-col min-h-0 p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <Activity className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{t("running.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("running.subtitle")}</p>
        </div>
      </div>

      {runs === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Activity className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t("running.empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelectedId(r.id)}
                className="flex w-full items-center gap-3 rounded-xl border bg-card/50 p-3.5 text-left shadow-card transition-all duration-200 hover:border-primary/30 hover:shadow-card-hover"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{r.agent_name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {r.repo}
                    {r.card_number != null ? ` · #${r.card_number}` : ""}
                  </span>
                </div>
                <StatusBadge status={r.status} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedId && <RunModal runId={selectedId} onClose={() => { setSelectedId(null); load(); }} />}
    </div>
  );
}
