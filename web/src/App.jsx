import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 30_000;

const PRIORITY_LABEL = { 0: "No priority", 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" };
const PRIORITY_CLASS = { 0: "p-none", 1: "p-urgent", 2: "p-high", 3: "p-medium", 4: "p-low" };

// Linear state type → accent token
const STATE_TYPE_CLASS = {
  triage:    "st-triage",
  backlog:   "st-backlog",
  unstarted: "st-unstarted",
  started:   "st-started",
  completed: "st-completed",
  cancelled: "st-cancelled",
};

const STATE_TYPE_ICON = {
  triage:    "?",
  backlog:   "○",
  unstarted: "◌",
  started:   "◑",
  completed: "●",
  cancelled: "✕",
};

function fmtDate(d) {
  if (!d) return null;
  return new Date(d.includes("T") ? d : `${d}T00:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short",
  });
}

function isOverdue(d) {
  if (!d) return false;
  return new Date(d.includes("T") ? d : `${d}T00:00:00Z`) < new Date();
}

// ── Card ─────────────────────────────────────────────────────────────────────
function Card({ card, stateType, onClick }) {
  const pClass = PRIORITY_CLASS[card.priority] ?? "p-none";
  const due    = card.dueDate;
  const overdue = isOverdue(due);

  return (
    <button className={`card ${pClass}`} type="button" onClick={onClick}>
      <div className="card-top">
        <span className="card-id">{card.identifier}</span>
        {card.priority != null && (
          <span className={`priority-badge ${pClass}`}>{PRIORITY_LABEL[card.priority]}</span>
        )}
      </div>
      <p className="card-title">{card.rawTitle || card.title}</p>
      {(card.rawLabels || []).length > 0 && (
        <div className="card-labels">
          {card.rawLabels.map((l) => (
            <span key={l.name} className="label-chip">{l.name}</span>
          ))}
        </div>
      )}
      <div className="card-footer">
        {card.assigneeDisplay && (
          <span className="assignee">@{card.assigneeDisplay}</span>
        )}
        {due && (
          <span className={`due ${overdue ? "overdue" : "ok"}`}>
            {overdue ? "⚠" : "⏰"} {fmtDate(due)}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────
function Column({ column, cards, onCardClick }) {
  const stClass = STATE_TYPE_CLASS[column.type] ?? "st-unstarted";
  const icon    = STATE_TYPE_ICON[column.type] ?? "○";

  return (
    <section className={`column ${stClass}`}>
      <header className="col-header">
        <span className="col-icon">{icon}</span>
        <h2 className="col-name">{column.name}</h2>
        <span className="col-count">{cards.length}</span>
      </header>
      <div className="col-cards">
        {cards.length === 0 ? (
          <p className="col-empty">Nenhuma issue</p>
        ) : (
          cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              stateType={column.type}
              onClick={() => onCardClick(card, column)}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ card, column, onClose }) {
  const pClass  = PRIORITY_CLASS[card.priority] ?? "p-none";
  const stClass = STATE_TYPE_CLASS[column.type] ?? "st-unstarted";
  const due     = card.dueDate;
  const overdue = isOverdue(due);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-id-row">
            <span className={`modal-state-chip ${stClass}`}>
              {STATE_TYPE_ICON[column.type]} {column.name}
            </span>
            <span className="modal-id">{card.identifier}</span>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <h2 className="modal-title">{card.rawTitle || card.title}</h2>

        <div className="modal-meta">
          <div className="meta-row">
            <span className="meta-label">Prioridade</span>
            <span className={`priority-badge ${pClass}`}>{PRIORITY_LABEL[card.priority] ?? "—"}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Assignee</span>
            <span className="meta-value">{card.assigneeDisplay ? `@${card.assigneeDisplay}` : "—"}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Vencimento</span>
            <span className={`meta-value ${due ? (overdue ? "overdue" : "ok") : ""}`}>
              {due ? `${overdue ? "⚠ " : ""}${fmtDate(due)}` : "—"}
            </span>
          </div>
          {(card.rawLabels || []).length > 0 && (
            <div className="meta-row">
              <span className="meta-label">Labels</span>
              <div className="card-labels">
                {card.rawLabels.map((l) => (
                  <span key={l.name} className="label-chip">{l.name}</span>
                ))}
              </div>
            </div>
          )}
          <div className="meta-row">
            <span className="meta-label">URL</span>
            <a className="meta-link" href={card.url} target="_blank" rel="noreferrer">
              Abrir no Linear ↗
            </a>
          </div>
        </div>

        {card.description?.trim() && (
          <div className="modal-description">
            <h3>Descrição</h3>
            <pre>{card.description.trim()}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData]           = useState({ columns: [], cardsByColumn: {} });
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [selected, setSelected]   = useState(null); // { card, column }
  const [lastSync, setLastSync]   = useState(null);
  const [syncing, setSyncing]     = useState(false);

  const totalCards = useMemo(
    () => Object.values(data.cardsByColumn || {}).reduce((n, arr) => n + arr.length, 0),
    [data]
  );

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setSyncing(true);
    try {
      const res = await fetch("/api/board");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const payload = await res.json();
      setData(payload);
      setError("");
      setLastSync(new Date());
    } catch (err) {
      setError(err.message || "Erro ao carregar board.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    refresh(true);
    const t = setInterval(() => refresh(false), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="app">
      {/* ── top bar ─────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">🌸</span>
          <div>
            <h1>Hana Board</h1>
            <p className="topbar-sub">
              {data.columns.length} colunas · {totalCards} issues
            </p>
          </div>
        </div>
        <div className="topbar-right">
          <span className="sync-time">
            {lastSync ? `Sync ${lastSync.toLocaleTimeString("pt-BR")}` : "—"}
          </span>
          <button
            className={`btn-refresh ${syncing ? "spinning" : ""}`}
            type="button"
            onClick={() => refresh(true)}
            disabled={syncing}
          >
            ↻ Atualizar
          </button>
        </div>
      </header>

      {/* ── error ───────────────────────────────────────────────────────── */}
      {error && <div className="error-bar">{error}</div>}

      {/* ── board ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="loader">
          <span className="loader-dot" />
          <span className="loader-dot" />
          <span className="loader-dot" />
        </div>
      ) : (
        <main className="board">
          {data.columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              cards={data.cardsByColumn[col.id] || []}
              onCardClick={(card, column) => setSelected({ card, column })}
            />
          ))}
        </main>
      )}

      {/* ── detail modal ────────────────────────────────────────────────── */}
      {selected && (
        <DetailModal
          card={selected.card}
          column={selected.column}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
