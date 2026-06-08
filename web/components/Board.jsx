"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({ item }) {
  return (
    <div className="card p-none">
      <div className="card-top">
        {item.number != null && (
          <span className="card-id">#{item.number}</span>
        )}
        {item.type === "PullRequest" && (
          <span className="card-type-badge">PR</span>
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
                background:   `#${l.color}22`,
                color:        `#${l.color}`,
                borderColor:  `#${l.color}55`,
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

// ── Column ────────────────────────────────────────────────────────────────────

function Column({ name, items, onColScroll, loadingMore }) {
  return (
    <div className="column">
      <div className="col-header">
        <span className="col-name">{name}</span>
        <span className="col-count">{items.length}</span>
      </div>
      <div className="col-cards" onScroll={onColScroll}>
        {items.length === 0 && <p className="col-empty">Sem cards</p>}
        {items.map((item) => (
          <Card key={item.id} item={item} />
        ))}
        {loadingMore && <p className="col-loading-more">Carregando…</p>}
      </div>
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────

export default function Board({ board }) {
  const [items, setItems]             = useState([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor]     = useState(null);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]             = useState(null);

  const fetchingRef = useRef(false);
  const stateRef    = useRef({ hasNextPage: false, endCursor: null });

  const fetchItems = useCallback(async (cursor = null) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const isFirst = cursor === null;
    if (isFirst) setLoading(true); else setLoadingMore(true);
    setError(null);

    try {
      const qs = `first=30${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(`/api/github/boards/${encodeURIComponent(board.id)}/items?${qs}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setItems((prev) => isFirst ? data.items : [...prev, ...data.items]);
      setHasNextPage(data.hasNextPage);
      setEndCursor(data.endCursor);
      stateRef.current = { hasNextPage: data.hasNextPage, endCursor: data.endCursor };
    } catch (err) {
      setError(err.message);
    } finally {
      fetchingRef.current = false;
      if (isFirst) setLoading(false); else setLoadingMore(false);
    }
  }, [board.id]);

  useEffect(() => {
    setItems([]);
    setHasNextPage(false);
    setEndCursor(null);
    setError(null);
    stateRef.current = { hasNextPage: false, endCursor: null };
    fetchItems(null);
  }, [board.id, fetchItems]);

  function handleColScroll(e) {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
    if (nearBottom && stateRef.current.hasNextPage && !fetchingRef.current) {
      fetchItems(stateRef.current.endCursor);
    }
  }

  const columns = board.columns ?? [];
  const grouped = Object.fromEntries(columns.map((c) => [c, []]));
  for (const item of items) {
    if (item.status && Object.prototype.hasOwnProperty.call(grouped, item.status)) {
      grouped[item.status].push(item);
    }
  }

  if (loading) {
    return (
      <div className="loader">
        <span className="loader-dot" />
        <span className="loader-dot" />
        <span className="loader-dot" />
      </div>
    );
  }

  if (error) {
    return <div className="error-bar">{error}</div>;
  }

  return (
    <div className="board">
      {columns.map((col) => (
        <Column
          key={col}
          name={col}
          items={grouped[col] ?? []}
          onColScroll={handleColScroll}
          loadingMore={loadingMore}
        />
      ))}
    </div>
  );
}
