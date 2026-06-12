"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Card from "@/components/board/Card.jsx";

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
    <div className="col-loader">
      <span className="col-loader-dot" />
      <span className="col-loader-dot" />
      <span className="col-loader-dot" />
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
    <div className="column" style={{ borderTop: `2px solid ${accentColor}` }}>
      <div className="col-header">
        <span className="col-name" style={{ color: accentColor }}>
          {columnName}
        </span>
        {!loading && (
          <span className="col-count">
            {items.length}
            {hasNextPage ? "+" : ""}
          </span>
        )}
        <button
          className={`col-refresh-btn${loading ? " spinning" : ""}`}
          title="Atualizar coluna"
          disabled={loading}
          onClick={() => {
            setItems([]);
            pageRef.current = { hasNextPage: false, cursor: null };
            fetchItems(null);
          }}
        >
          ↻
        </button>
      </div>
      <div className="col-cards" onScroll={handleScroll}>
        {loading && <ColumnLoader />}
        {!loading && error && <p className="col-error">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="col-empty">Sem cards</p>
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
        {loadingMore && <p className="col-loading-more">Carregando…</p>}
      </div>
    </div>
  );
}
