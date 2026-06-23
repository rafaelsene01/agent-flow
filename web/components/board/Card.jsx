"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
        <span className="text-[9px] font-semibold uppercase text-muted-foreground leading-none">
          {login[0]}
        </span>
      )}
    </div>
  );
}

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
  const isFinished =
    wt && (wt.status === "done" || wt.tlcExecStatus === "done");
  const hasBranch = !!wt;

  return (
    <div
      className={cn(
        "rounded-lg",
        isRunning && "card-running p-[2px]",
        !isRunning && isFinished && "card-branch-gold p-[2px]",
        !isRunning && !isFinished && hasBranch && "card-branch-silver p-[2px]"
      )}
    >
      <button
        type="button"
        className={cn(
          "cursor-pointer flex flex-col gap-1.5 p-3 rounded-lg",
          "transition-all duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:shadow-card-hover hover:-translate-y-0.5 hover:bg-muted/30 text-left w-full",
          isRunning || hasBranch
            ? "bg-card border border-transparent"
            : "bg-card border border-l-[3px] border-l-border shadow-card",
          !isRunning && isFinished && "card-branch-gold-inner"
        )}
        onClick={() => onOpen(item)}
      >
        <div className="flex items-center justify-between gap-1.5">
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
      </button>
    </div>
  );
}
