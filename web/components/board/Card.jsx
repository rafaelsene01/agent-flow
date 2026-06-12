"use client";

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
    <div className="card p-none" onClick={() => onOpen(item)}>
      <div className="card-top">
        {item.number != null && <span className="card-id">#{item.number}</span>}
        {item.type === "PullRequest" && (
          <span className="card-type-badge">PR</span>
        )}
        {isRunning && (
          <span className="card-running-dot" title="Processo em execução…" />
        )}
      </div>
      <p className="card-title">{item.title}</p>
      {item.labels.length > 0 && (
        <div className="card-labels">
          {item.labels.map((l) => (
            <span
              key={l.name}
              className="label-chip"
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
        <div className="card-footer">
          <span className="assignee">{item.assignees.join(", ")}</span>
        </div>
      )}
    </div>
  );
}
