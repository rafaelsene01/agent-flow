"use client";

import { useEffect, useState } from "react";
import { boardSlug } from "@/lib/boardSlug.js";

export default function InitBoardModal({ onClose, onSaved }) {
  const [boards, setBoards]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [fetchError, setFetchError]       = useState(null);
  const [missingScope, setMissingScope]   = useState(false);
  const [selected, setSelected]             = useState(null);
  const [boardName, setBoardName]           = useState("");
  const [views, setViews]                   = useState([]);
  const [viewsLoading, setViewsLoading]     = useState(false);
  const [selectedView, setSelectedView]     = useState(null);
  const [columns, setColumns]               = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [selectedCols, setSelectedCols]     = useState([]);
  const [saving, setSaving]                 = useState(false);

  useEffect(() => {
    fetch("/api/github/boards")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          if (data.error.includes("MISSING_SCOPE:read:project")) {
            setMissingScope(true);
          } else {
            setFetchError(data.error);
          }
          setLoading(false);
          return;
        }
        setBoards(data);
        setLoading(false);
      })
      .catch((err) => { setFetchError(err.message); setLoading(false); });
  }, []);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  function selectBoard(board) {
    setSelected(board);
    setBoardName(board.title);
    setViews([]);
    setSelectedView(null);
    setColumns([]);
    setSelectedCols([]);
    setViewsLoading(true);
    fetch(`/api/github/boards/${encodeURIComponent(board.id)}/views`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setViews(data);
          if (data.length === 1) selectView(board, data[0]);
        }
      })
      .finally(() => setViewsLoading(false));
  }

  function selectView(board, view) {
    setSelectedView(view);
    setColumns([]);
    setSelectedCols([]);
    setColumnsLoading(true);
    fetch(`/api/github/boards/${encodeURIComponent(board.id)}/columns`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setColumns(data);
          setSelectedCols(data.map((c) => c.id));
        }
      })
      .finally(() => setColumnsLoading(false));
  }

  function toggleCol(id) {
    setSelectedCols((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const configRes = await fetch("/api/config");
      const config = await configRes.json();
      const existing = config.boards ?? [];

      const name     = boardName || selected.title;
      const repoName = selectedView?.repo ?? "";
      const newBoard = {
        id:         selected.id,
        viewId:     selectedView?.id ?? null,
        viewNumber: selectedView?.number ?? null,
        viewName:   selectedView?.name ?? null,
        name,
        slug:       boardSlug({ name, repoName }),
        boardPath:  "",
        repoName,
        repoPath:   "",
        columns:    columns
          .filter((c) => selectedCols.includes(c.id))
          .map((c) => ({ id: c.id, name: c.name })),
      };

      await fetch("/api/config", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ boards: [...existing, newBoard] }),
      });

      onSaved(newBoard);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal init-board-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <div className="modal-id-row">
            <span style={{ fontSize: 18 }}>⊞</span>
            <h2 className="modal-title" style={{ fontSize: 16, marginBottom: 0 }}>
              Inicializar Board
            </h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose}>✕</button>
        </div>

        <div className="sf-body">
          <div className="sf-field">
            <label className="sf-label">Board GitHub</label>

            {loading && <div className="board-select-state">Carregando boards…</div>}

            {fetchError && <div className="board-select-state err">{fetchError}</div>}

            {missingScope && (
              <div className="scope-error">
                <p className="scope-error-msg">
                  O token do <code>gh</code> não tem o escopo <code>read:project</code>. Execute o comando abaixo e reinicie o servidor:
                </p>
                <div className="scope-error-cmd">
                  <code>gh auth refresh -s read:project</code>
                  <button
                    className="scope-copy-btn"
                    type="button"
                    onClick={() => navigator.clipboard?.writeText("gh auth refresh -s read:project")}
                  >
                    ⎘
                  </button>
                </div>
              </div>
            )}

            {!loading && !fetchError && !missingScope && boards.length === 0 && (
              <div className="board-select-state">Nenhum board encontrado no GitHub Projects.</div>
            )}

            {!loading && boards.length > 0 && (
              <div className="board-select-list">
                {boards.map((b) => (
                  <button
                    key={b.id}
                    className={`board-select-item${selected?.id === b.id ? " selected" : ""}`}
                    type="button"
                    onClick={() => selectBoard(b)}
                  >
                    <span className="board-select-title">{b.title}</span>
                    <span className="board-select-meta">#{b.number}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <>
              <div className="sf-field">
                <label className="sf-label">Nome do Board</label>
                <input
                  className="sf-input"
                  type="text"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                />
              </div>

              <div className="sf-field">
                <label className="sf-label">Colunas visíveis</label>
                {columnsLoading && (
                  <div className="board-select-state">Carregando colunas…</div>
                )}
                {!columnsLoading && columns.length > 0 && (
                  <div className="sf-checkgrid">
                    {columns.map((col) => {
                      const checked = selectedCols.includes(col.id);
                      return (
                        <label
                          key={col.id}
                          className={`sf-check${checked ? " checked" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCol(col.id)}
                          />
                          <span className="sf-check-dot" />
                          {col.name}
                        </label>
                      );
                    })}
                  </div>
                )}
                {!columnsLoading && columns.length === 0 && (
                  <div className="board-select-state">Nenhuma coluna encontrada.</div>
                )}
              </div>

              <div className="sf-field">
                <label className="sf-label">View</label>
                {viewsLoading && (
                  <div className="board-select-state">Carregando views…</div>
                )}
                {!viewsLoading && views.length === 0 && (
                  <div className="board-select-state">Nenhuma view encontrada.</div>
                )}
                {!viewsLoading && views.length > 0 && (
                  <div className="board-select-list">
                    {views.map((v) => (
                      <button
                        key={v.id}
                        className={`board-select-item${selectedView?.id === v.id ? " selected" : ""}`}
                        type="button"
                        onClick={() => selectView(selected, v)}
                      >
                        <span className="board-select-title">{v.name}</span>
                        <span className="board-select-meta">
                          {v.repo ?? <span style={{ color: "var(--text-faint)" }}>sem repo</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="sf-footer">
          <div className="sf-footer-actions">
            <button className="btn-secondary" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              type="button"
              disabled={!selected || !boardName || !selectedView || saving || columnsLoading || selectedCols.length === 0}
              onClick={save}
            >
              {saving ? "Salvando…" : "Adicionar Board"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
