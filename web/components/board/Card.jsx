"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Check, GitBranch } from "lucide-react";
import { useI18n } from "@/lib/i18nContext";

function Assignee({ login, avatarUrl }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div
      title={`@${login}`}
      className="size-5 rounded-full border-2 border-background overflow-hidden bg-muted flex items-center justify-center shrink-0"
    >
      {avatarUrl && !imgFailed ? (
        <img
          src={avatarUrl}
          alt={login}
          className="size-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="text-xs font-semibold uppercase text-muted-foreground leading-none">
          {login[0]}
        </span>
      )}
    </div>
  );
}

// Apenas expõe a cor da label como CSS var; o contraste do texto é resolvido
// por tema em globals.css (.label-chip), evitando texto escuro sobre fundo
// escuro no dark mode. Ver regra color-accessible-pairs.
function getLabelStyle(color) {
  return { "--label-c": `#${color ?? "888888"}` }
}

export default function Card({ item, onOpen, worktrees = [], originRepo = null }) {
  const { t } = useI18n();
  const worktreeId =
    originRepo && item.number != null ? `${originRepo}#${item.number}` : null;
  const wt = worktreeId ? worktrees.find((w) => w.id === worktreeId) : null;
  const isRunning =
    wt &&
    (wt.status === "running" ||
      wt.tlcStatus === "running" ||
      wt.tlcExecStatus === "running" ||
      wt.commitPushStatus === "running");
  const isFinished =
    wt && (wt.status === "done" || wt.tlcExecStatus === "done");
  const hasBranch = !!wt;
  const isWaiting =
    wt &&
    (wt.status === "waiting-input" || wt.tlcExecStatus === "waiting-input");

  // Indicador de estado não dependente só de cor (regra color-not-only):
  // além da borda colorida/animada, o card mostra um ícone + rótulo acessível.
  const status = isRunning
    ? { Icon: Loader2, spin: true, label: t("status.running"), className: "text-blue-500 dark:text-blue-400" }
    : isWaiting
      ? { Icon: Clock, label: t("legend.waiting"), className: "text-amber-500 dark:text-amber-400" }
      : isFinished
        ? { Icon: Check, label: t("legend.done"), className: "text-amber-600 dark:text-amber-400" }
        : hasBranch
          ? { Icon: GitBranch, label: t("legend.branch"), className: "text-muted-foreground" }
          : null;

  return (
    <div
      className={cn(
        "rounded-lg",
        isRunning && "card-running p-[2px]",
        !isRunning && isWaiting && "card-waiting p-[2px]",
        !isRunning && !isWaiting && isFinished && "card-branch-gold p-[2px]",
        !isRunning && !isWaiting && !isFinished && hasBranch && "card-branch-silver p-[2px]"
      )}
    >
      <button
        type="button"
        className={cn(
          "cursor-pointer flex flex-col gap-1.5 p-3 rounded-lg",
          "transition-all duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:shadow-card-hover hover:-translate-y-0.5 hover:bg-muted/30 text-left w-full",
          isRunning || hasBranch || isWaiting
            ? "bg-card border border-transparent"
            : "bg-card border border-l-[3px] border-l-border shadow-card",
          !isRunning && !isWaiting && isFinished && "card-branch-gold-inner"
        )}
        onClick={() => onOpen(item)}
      >
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            {status && (
              <span
                title={status.label}
                aria-label={status.label}
                className={cn("inline-flex shrink-0", status.className)}
              >
                <status.Icon
                  className={cn("size-3.5", status.spin && "animate-spin motion-reduce:animate-none")}
                  strokeWidth={2.25}
                />
              </span>
            )}
            {item.number != null && (
              <span className="font-mono text-[11px] text-muted-foreground">
                #{item.number}
              </span>
            )}
            {item.type === "PullRequest" && (
              <Badge
                variant="outline"
                className="text-xs text-primary border-primary/40 px-1.5 py-0"
              >
                PR
              </Badge>
            )}
          </div>
          {item.assignees.length > 0 && (
            <div className="flex items-center -space-x-1.5">
              {item.assignees.map((a) => {
                const login = typeof a === "string" ? a : a?.login;
                const avatarUrl = typeof a === "string" ? null : a?.avatarUrl;
                if (!login) return null;
                return <Assignee key={login} login={login} avatarUrl={avatarUrl} />;
              })}
            </div>
          )}
        </div>
        <p className="text-[13px] font-medium leading-snug">{item.title}</p>
        {item.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.labels.map((l) => (
              <span
                key={l.name}
                className="label-chip text-[11px] px-2 py-px rounded-full border"
                style={getLabelStyle(l.color)}
              >
                {l.name}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}
