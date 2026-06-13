"use client";

import { useEffect, useState } from "react";
import Column from "@/components/board/Column.jsx";
import CardModal from "@/components/board/CardModal.jsx";

function normalizeColumns(raw) {
  return (raw ?? []).map((col) =>
    typeof col === "string" ? { id: null, name: col } : col,
  );
}

export default function Board({ board }) {
  const columns = normalizeColumns(board?.columns);
  const [activeCard, setActiveCard] = useState(null);
  const [worktrees, setWorktrees] = useState([]);
  const [rateLimitError, setRateLimitError] = useState(null);

  function loadWorktrees() {
    fetch("/api/config/worktrees")
      .then(async (r) => {
        if (r.status === 429) {
          const d = await r.json().catch(() => ({}));
          setRateLimitError(d.error ?? "GitHub rate limit atingido.");
          return null;
        }
        return r.json();
      })
      .then((data) => { if (data) setWorktrees(data); })
      .catch(() => {});
  }

  useEffect(loadWorktrees, []);

  // Re-poll while any worktree has a running process
  useEffect(() => {
    const anyRunning = worktrees.some(
      (w) =>
        w.status === "running" ||
        w.tlcStatus === "running" ||
        w.tlcExecStatus === "running" ||
        w.commitPushStatus === "running",
    );
    if (!anyRunning) return;
    const timer = setInterval(loadWorktrees, 3000);
    return () => clearInterval(timer);
  }, [worktrees]);

  if (rateLimitError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-destructive">{rateLimitError}</p>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Nenhuma coluna configurada. Edite o board para adicionar colunas.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-3 px-5 py-4 overflow-x-auto flex-1 items-start">
        {columns.map((col) => (
          <Column
            key={`${board.id}:${col.id ?? col.name}`}
            boardId={board.id}
            columnId={col.id}
            columnName={col.name}
            columnColor={col.color ?? null}
            viewFilter={board.viewFilter ?? null}
            onCardOpen={setActiveCard}
            worktrees={worktrees}
            originRepo={board?.originRepo ?? null}
          />
        ))}
      </div>
      {activeCard && (
        <CardModal
          item={activeCard}
          board={board}
          onClose={() => setActiveCard(null)}
          onWorktreeChange={loadWorktrees}
        />
      )}
    </>
  );
}
