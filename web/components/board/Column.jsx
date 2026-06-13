"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Card from "@/components/board/Card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Skeleton } from "@/components/ui/skeleton.jsx";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const GH_COLORS = {
  GRAY: "#7d8590",
  BLUE: "#58a6ff",
  GREEN: "#3fb950",
  YELLOW: "#e3b341",
  ORANGE: "#fb8f44",
  RED: "#f85149",
  PINK: "#f778ba",
  PURPLE: "#bf68d9",
};

function ColumnLoader() {
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <Skeleton className="h-20 rounded-lg" />
      <Skeleton className="h-20 rounded-lg" />
      <Skeleton className="h-20 rounded-lg" />
    </div>
  );
}

export default function Column({
  boardId,
  columnId,
  columnName,
  columnColor,
  viewFilter,
  onCardOpen,
  worktrees,
  originRepo,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const fetchingRef = useRef(false);
  const pageRef = useRef({ hasNextPage: false, cursor: null });

  const fetchItems = useCallback(
    async (cursor = null) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      const isFirst = cursor === null;
      if (isFirst) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const qs = new URLSearchParams({ first: "30" });
        if (columnId) qs.set("columnId", columnId);
        else qs.set("columnName", columnName);
        if (viewFilter) qs.set("viewFilter", viewFilter);
        if (cursor) qs.set("after", cursor);

        const res = await fetch(
          `/api/github/boards/${encodeURIComponent(boardId)}/items?${qs}`,
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setItems((prev) => (isFirst ? data.items : [...prev, ...data.items]));
        pageRef.current = {
          hasNextPage: data.hasNextPage,
          cursor: data.endCursor,
        };
      } catch (err) {
        setError(err.message);
      } finally {
        fetchingRef.current = false;
        if (isFirst) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [boardId, columnId, columnName, viewFilter],
  );

  useEffect(() => {
    setItems([]);
    pageRef.current = { hasNextPage: false, cursor: null };
    fetchItems(null);
  }, [fetchItems]);

  function handleScroll(e) {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
    if (nearBottom && pageRef.current.hasNextPage && !fetchingRef.current) {
      fetchItems(pageRef.current.cursor);
    }
  }

  const { hasNextPage } = pageRef.current;

  const accentColor = GH_COLORS[columnColor] ?? GH_COLORS.GRAY;

  return (
    <div
      className="w-[280px] min-w-[260px] shrink-0 bg-card border rounded-xl flex flex-col max-h-[calc(100vh-90px)]"
      style={{ borderTop: `2px solid ${accentColor}` }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b">
        <span className="text-sm font-medium flex-1 truncate" style={{ color: accentColor }}>
          {columnName}
        </span>
        {!loading && (
          <Badge variant="secondary" className="text-xs">
            {items.length}
            {hasNextPage ? "+" : ""}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          title="Atualizar coluna"
          disabled={loading}
          onClick={() => {
            setItems([]);
            pageRef.current = { hasNextPage: false, cursor: null };
            fetchItems(null);
          }}
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
        </Button>
      </div>
      <div className="p-2 flex flex-col gap-1.5 overflow-y-auto flex-1" onScroll={handleScroll}>
        {loading && <ColumnLoader />}
        {!loading && error && (
          <p className="text-xs text-destructive text-center py-3">{error}</p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-5">Sem cards</p>
        )}
        {!loading &&
          items.map((item) => (
            <Card
              key={item.id}
              item={item}
              onOpen={onCardOpen}
              worktrees={worktrees}
              originRepo={originRepo}
            />
          ))}
        {loadingMore && (
          <p className="text-xs text-muted-foreground text-center py-2">Carregando…</p>
        )}
      </div>
    </div>
  );
}
