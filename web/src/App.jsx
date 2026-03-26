import { useCallback, useEffect, useMemo, useState } from "react";
import SettingsModal from "./SettingsModal.jsx";

const POLL_MS = 30_000;

const PRIORITY_LABEL = { 0: "No priority", 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" };
const PRIORITY_CLASS  = { 0: "p-none", 1: "p-urgent", 2: "p-high", 3: "p-medium", 4: "p-low" };
const STATE_TYPE_CLASS = {
  triage: "st-triage", backlog: "st-backlog", unstarted: "st-unstarted",
  started: "st-started", completed: "st-completed", cancelled: "st-cancelled",
};
const STATE_TYPE_ICON = {
  triage: "?", backlog: "○", unstarted: "◌", started: "◑", completed: "●", cancelled: "✕",
};

function fmtDate(d) {
  if (!d) return null;
  return new Date(d.includes("T") ? d : `${d}T00:00:00Z`)
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
function isOverdue(d) {
  if (!d) return false;
  return new Date(d.includes("T") ? d : `${d}T00:00:00Z`) < new Date();
}

function Card({ card, onClick, onMove, moving }) {
  const pClass  = PRIORITY_CLASS[card.priority] ?? "p-none";
  const overdue = isOverdue(card.dueDate);
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
          {card.rawLabels.map((l) => <span key={l.name} className="label-chip">{l.name}</span>)}
        </div>
      )}
      <div className="card-footer">
        {card.assigneeDisplay && <span className="assignee">@{card.assigneeDisplay}</span>}
        {card.dueDate && (
          <span className={`due ${overdue ? "overdue" : "ok"}`}>
            {overdue ? "⚠" : "⏰"} {fmtDate(card.dueDate)}
          </span>
        )}
      </div>
      {onMove && (
        <button
          className={`btn-move ${moving ? "moving" : ""}`}
          type="button"
          disabled={moving}
          onClick={(e) => { e.stopPropagation(); onMove(card.id); }}
        >
          {moving ? "Movendo…" : "▶ Iniciar"}
        </button>
      )}
    </button>
  );
}

function Column({ column, cards, onCardClick, actOnColumn, inProgressName, onMoved }) {
  const stClass   = STATE_TYPE_CLASS[column.type] ?? "st-unstarted";
  const icon      = STATE_TYPE_ICON[column.type]  ?? "○";
  const isActOn   = actOnColumn && column.name.toLowerCase() === actOnColumn.toLowerCase();
  const [movingId, setMovingId] = useState(null);

  async function handleMove(issueId) {
    setMovingId(issueId);
    try {
      const res = await fetch("/api/board/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao mover card.");
      onMoved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setMovingId(null);
    }
  }

  return (
    <section className={`column ${stClass}`}>
      <header className="col-header">
        <span className="col-icon">{icon}</span>
        <h2 className="col-name">{column.name}</h2>
        <span className="col-count">{cards.length}</span>
        {isActOn && inProgressName && (
          <span className="col-act-badge" title={`Clique em "Iniciar" para mover para ${inProgressName}`}>
            → {inProgressName}
          </span>
        )}
      </header>
      <div className="col-cards">
        {cards.length === 0
          ? <p className="col-empty">Nenhuma issue</p>
          : cards.map((c) => (
              <Card
                key={c.id}
                card={c}
                onClick={() => onCardClick(c, column)}
                onMove={isActOn ? handleMove : null}
                moving={movingId === c.id}
              />
            ))
        }
      </div>
    </section>
  );
}

function DetailModal({ card, column, onClose }) {
  const pClass  = PRIORITY_CLASS[card.priority] ?? "p-none";
  const stClass = STATE_TYPE_CLASS[column.type]  ?? "st-unstarted";
  const overdue = isOverdue(card.dueDate);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
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
          <button className="modal-close" type="button" onClick={onClose}>✕</button>
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
            <span className={`meta-value ${card.dueDate ? (overdue ? "overdue" : "ok") : ""}`}>
              {card.dueDate ? `${overdue ? "⚠ " : ""}${fmtDate(card.dueDate)}` : "—"}
            </span>
          </div>
          {(card.rawLabels || []).length > 0 && (
            <div className="meta-row">
              <span className="meta-label">Labels</span>
              <div className="card-labels">
                {card.rawLabels.map((l) => <span key={l.name} className="label-chip">{l.name}</span>)}
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

function EmptyBoard({ onOpenSettings }) {
  return (
    <div className="empty-board">
      <div className="empty-board-inner">
        <span className="empty-logo">🌸</span>
        <h2>Bem-vindo ao Hana</h2>
        <p>Nenhuma configuração encontrada neste diretório.</p>
        <p>Configure sua API key e escolha um time para começar.</p>
        <button className="btn-primary" type="button" onClick={onOpenSettings}>
          Configurar agora
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData]               = useState({ columns: [], cardsByColumn: {}, unconfigured: false });
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [selected, setSelected]       = useState(null);
  const [lastSync, setLastSync]       = useState(null);
  const [syncing, setSyncing]         = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [actOnColumn, setActOnColumn] = useState("");
  const [inProgressName, setInProgressName] = useState("");

  const totalCards = useMemo(
    () => Object.values(data.cardsByColumn || {}).reduce((n, a) => n + a.length, 0),
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

      const cfg = await fetch("/api/config").then(r => r.json()).catch(() => null);
      if (cfg) {
        setActOnColumn(cfg.act_on || "");
        setInProgressName(cfg.in_progress || "");
      }

      if (payload.unconfigured) setShowSettings(true);
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

  const isUnconfigured = data.unconfigured && !loading;

  return (
    <div className="app">
      {}
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">🌸</span>
          <div>
            <h1>Hana Board</h1>
            {!isUnconfigured && (
              <p className="topbar-sub">{data.columns.length} colunas · {totalCards} issues</p>
            )}
          </div>
        </div>
        <div className="topbar-right">
          {!isUnconfigured && (
            <>
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
            </>
          )}
          <button
            className="btn-settings"
            type="button"
            onClick={() => setShowSettings(true)}
            title="Configurações"
          >
            ⚙
          </button>
        </div>
      </header>

      {error && <div className="error-bar">{error}</div>}

      {loading ? (
        <div className="loader">
          <span className="loader-dot" /><span className="loader-dot" /><span className="loader-dot" />
        </div>
      ) : isUnconfigured ? (
        <EmptyBoard onOpenSettings={() => setShowSettings(true)} />
      ) : (
        <main className="board">
          {data.columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              cards={data.cardsByColumn[col.id] || []}
              onCardClick={(card, column) => setSelected({ card, column })}
              actOnColumn={actOnColumn}
              inProgressName={inProgressName}
              onMoved={() => refresh(false)}
            />
          ))}
        </main>
      )}

      {selected && !showSettings && (
        <DetailModal
          card={selected.card}
          column={selected.column}
          onClose={() => setSelected(null)}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
            setTimeout(() => refresh(true), 300);
          }}
        />
      )}
    </div>
  );
}
