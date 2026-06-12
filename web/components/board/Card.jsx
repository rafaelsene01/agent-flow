"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function Card({ item, onOpen, worktrees = [], originRepo = null }) {
  const worktreeId =
    originRepo && item.number != null ? `${originRepo}#${item.number}` : null;
  const wt = worktreeId ? worktrees.find((w) => w.id === worktreeId) : null;
  const isRunning =
    wt &&
    (wt.status === "running" ||
      wt.tlcStatus === "running" ||
      wt.tlcExecStatus === "running" ||
      wt.commitPushStatus === "running");

  return (
    <button
      type="button"
      className={cn(
        "cursor-pointer flex flex-col gap-1.5 p-3 bg-muted/40 border rounded-lg",
        "border-l-[3px] border-l-border transition hover:bg-muted hover:shadow-md hover:-translate-y-px",
        "text-left w-full"
      )}
      onClick={() => onOpen(item)}
    >
      <div className="flex items-center gap-1.5">
        {item.number != null && (
          <span className="font-mono text-[11px] text-muted-foreground">
            #{item.number}
          </span>
        )}
        {item.type === "PullRequest" && (
          <Badge
            variant="outline"
            className="text-[10px] text-primary border-primary/40 px-1.5 py-0"
          >
            PR
          </Badge>
        )}
        {isRunning && (
          <span
            className="size-1.5 rounded-full bg-primary animate-pulse"
            title="Processo em execução…"
          />
        )}
      </div>
      <p className="text-[13px] font-medium leading-snug">{item.title}</p>
      {item.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.labels.map((l) => (
            <span
              key={l.name}
              className="text-[11px] px-2 py-px rounded-full border"
              style={{
                background: `#${l.color}22`,
                color: `#${l.color}`,
                borderColor: `#${l.color}55`,
              }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      {item.assignees.length > 0 && (
        <div className="mt-0.5">
          <span className="text-xs text-muted-foreground">
            {item.assignees.join(", ")}
          </span>
        </div>
      )}
    </button>
  );
}
