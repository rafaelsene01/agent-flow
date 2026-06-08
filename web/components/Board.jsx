"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

// ── CardModal ─────────────────────────────────────────────────────────────────

const TYPE_LABEL = { Issue: "Issue", PullRequest: "Pull request", DraftIssue: "Draft issue" };

function CardModal({ item, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card-modal">
        <div className="card-modal-layout">
          {/* ── main ── */}
          <div className="card-modal-main">
            <div className="card-modal-fixed">
              <div className="card-modal-header">
                <div className="card-modal-header-left">
                  {item.number != null && <span className="modal-id">#{item.number}</span>}
                </div>
                <button className="modal-close" onClick={onClose}>✕</button>
              </div>
              <h2 className="modal-title card-modal-title">{item.title}</h2>
              <div className="card-modal-divider" />
              <div className="card-modal-desc-label">Descrição</div>
            </div>
            <div className="card-modal-scroll">
              {item.body ? (
                <div className="card-modal-body md">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[[rehypeHighlight, { detect: false }]]}
                  >
                    {item.body}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="card-modal-no-body">Sem descrição.</p>
              )}
            </div>
          </div>

          {/* ── sidebar ── */}
          <aside className="card-modal-sidebar">
            <div className="sidebar-section">
              <span className="sidebar-label">Assignees</span>
              {item.assignees.length > 0 ? (
                <div className="sidebar-assignees">
                  {item.assignees.map((a) => (
                    <span key={a} className="sidebar-assignee">@{a}</span>
                  ))}
                </div>
              ) : (
                <span className="sidebar-empty">Nenhum</span>
              )}
            </div>

            <div className="sidebar-section">
              <span className="sidebar-label">Labels</span>
              {item.labels.length > 0 ? (
                <div className="sidebar-labels">
                  {item.labels.map((l) => (
                    <span
                      key={l.name}
                      className="label-chip"
                      style={{
                        background:  `#${l.color}22`,
                        color:       `#${l.color}`,
                        borderColor: `#${l.color}55`,
                      }}
                    >
                      {l.name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="sidebar-empty">Nenhum</span>
              )}
            </div>

            {item.itemType && (
              <div className="sidebar-section">
                <span className="sidebar-label">Tipo</span>
                <span className="sidebar-value">{item.itemType}</span>
              </div>
            )}
            {!item.itemType && item.type !== "Issue" && (
              <div className="sidebar-section">
                <span className="sidebar-label">Tipo</span>
                <span className="sidebar-value">{TYPE_LABEL[item.type] ?? item.type}</span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({ item, onOpen }) {
  return (
    <div className="card p-none" onClick={() => onOpen(item)}>
      <div className="card-top">
        {item.number != null && <span className="card-id">#{item.number}</span>}
        {item.type === "PullRequest" && <span className="card-type-badge">PR</span>}
      </div>
      <p className="card-title">{item.title}</p>
      {item.labels.length > 0 && (
        <div className="card-labels">
          {item.labels.map((l) => (
            <span
              key={l.name}
              className="label-chip"
              style={{
                background:  `#${l.color}22`,
                color:       `#${l.color}`,
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

// ── ColumnLoader ──────────────────────────────────────────────────────────────

function ColumnLoader() {
  return (
    <div className="col-loader">
      <span className="col-loader-dot" />
      <span className="col-loader-dot" />
      <span className="col-loader-dot" />
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

const GH_COLORS = {
  GRAY:   "#7d8590",
  BLUE:   "#58a6ff",
  GREEN:  "#3fb950",
  YELLOW: "#e3b341",
  ORANGE: "#fb8f44",
  RED:    "#f85149",
  PINK:   "#f778ba",
  PURPLE: "#bf68d9",
};

function Column({ boardId, columnId, columnName, columnColor, viewFilter, onCardOpen }) {
  const [items, setItems]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]             = useState(null);

  const fetchingRef = useRef(false);
  const pageRef     = useRef({ hasNextPage: false, cursor: null });

  const fetchItems = useCallback(async (cursor = null) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const isFirst = cursor === null;
    if (isFirst) setLoading(true); else setLoadingMore(true);
    setError(null);

    try {
      const qs = new URLSearchParams({ first: "30" });
      if (columnId)   qs.set("columnId",   columnId);
      else            qs.set("columnName", columnName);
      if (viewFilter) qs.set("viewFilter", viewFilter);
      if (cursor)     qs.set("after",      cursor);

      const res  = await fetch(`/api/github/boards/${encodeURIComponent(boardId)}/items?${qs}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setItems((prev) => isFirst ? data.items : [...prev, ...data.items]);
      pageRef.current = { hasNextPage: data.hasNextPage, cursor: data.endCursor };
    } catch (err) {
      setError(err.message);
    } finally {
      fetchingRef.current = false;
      if (isFirst) setLoading(false); else setLoadingMore(false);
    }
  }, [boardId, columnId, columnName, viewFilter]);

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
        <span className="col-name" style={{ color: accentColor }}>{columnName}</span>
        {!loading && (
          <span className="col-count">
            {items.length}{hasNextPage ? "+" : ""}
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
        {!loading && items.map((item) => <Card key={item.id} item={item} onOpen={onCardOpen} />)}
        {loadingMore && <p className="col-loading-more">Carregando…</p>}
      </div>
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────

function normalizeColumns(raw) {
  return (raw ?? []).map((col) =>
    typeof col === "string" ? { id: null, name: col } : col
  );
}

export default function Board({ board }) {
  const columns = normalizeColumns(board?.columns);
  const [activeCard, setActiveCard] = useState(null);

  if (columns.length === 0) {
    return (
      <div className="empty-board">
        <div className="empty-board-inner">
          <p>Nenhuma coluna configurada. Edite o board para adicionar colunas.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="board">
        {columns.map((col) => (
          <Column
            key={`${board.id}:${col.id ?? col.name}`}
            boardId={board.id}
            columnId={col.id}
            columnName={col.name}
            columnColor={col.color ?? null}
            viewFilter={board.viewFilter ?? null}
            onCardOpen={setActiveCard}
          />
        ))}
      </div>
      {activeCard && <CardModal item={activeCard} onClose={() => setActiveCard(null)} />}
    </>
  );
}
