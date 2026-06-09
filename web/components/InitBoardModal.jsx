"use client";

import { useEffect, useRef, useState } from "react";
import { boardSlug } from "@/lib/boardSlug.js";

function colKey(c) {
  return c.id ?? c.name;
}

export default function InitBoardModal({ onClose, onSaved }) {
  const [boards, setBoards]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [fetchError, setFetchError]       = useState(null);
  const [missingScope, setMissingScope]   = useState(false);
  const [selected, setSelected]           = useState(null);
  const [originRepo, setOriginRepo]       = useState("");
  const [boardName, setBoardName]         = useState("");
  const [views, setViews]                 = useState([]);
  const [viewsLoading, setViewsLoading]   = useState(false);
  const [selectedView, setSelectedView]   = useState(null);
  const [allCols, setAllCols]             = useState([]);
  const [activeCols, setActiveCols]       = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [dragOver, setDragOver]           = useState(null);
  const [saving, setSaving]               = useState(false);
  const dragIdx = useRef(null);

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

  function repoOptions(boardData, view) {
    const fromRepos  = (boardData?.repos ?? []).map((r) => r.fullName);
    const fromFilter = (view?.repo ?? "").split(",").map((r) => r.trim()).filter(Boolean);
    return [...new Set([...fromRepos, ...fromFilter])];
  }

  function selectBoard(board) {
    setSelected(board);
    setBoardName(board.title);
    setViews([]);
    setSelectedView(null);
    setAllCols([]);
    setActiveCols([]);
    const opts = repoOptions(board, null);
    setOriginRepo(opts.length === 1 ? opts[0] : "");
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
    setAllCols([]);
    setActiveCols([]);
    // Atualiza opções de repo ao selecionar uma view (o filtro pode trazer novos repos)
    setOriginRepo((prev) => {
      const opts = repoOptions(board, view);
      if (prev && opts.includes(prev)) return prev;  // mantém seleção válida
      return opts.length === 1 ? opts[0] : "";
    });
    setColumnsLoading(true);
    fetch(`/api/github/boards/${encodeURIComponent(board.id)}/columns`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setAllCols(data);
          setActiveCols(data);
        }
      })
      .finally(() => setColumnsLoading(false));
  }

  // ── drag-and-drop ────────────────────────────────────────────────────────────

  function onDragStart(i) { dragIdx.current = i; }
  function onDragEnter(i) { setDragOver(i); }

  function onDrop(i) {
    const from = dragIdx.current;
    if (from === null || from === i) { resetDrag(); return; }
    const next = [...activeCols];
    const [item] = next.splice(from, 1);
    next.splice(i, 0, item);
    setActiveCols(next);
    resetDrag();
  }

  function resetDrag() {
    dragIdx.current = null;
    setDragOver(null);
  }

  function remove(col) {
    setActiveCols((prev) => prev.filter((c) => colKey(c) !== colKey(col)));
  }

  function add(col) {
    setActiveCols((prev) => [...prev, col]);
  }

  const available = allCols.filter((apiCol) =>
    !activeCols.some((ac) =>
      (ac.id && ac.id === apiCol.id) || ac.name === apiCol.name
    )
  );

  // ── save ─────────────────────────────────────────────────────────────────────

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const configRes = await fetch("/api/config");
      const config    = await configRes.json();
      const existing  = config.boards ?? [];

      const name      = boardName || selected.title;
      const repoName  = selectedView?.repo ?? "";
      const newBoard = {
        id:         selected.id,
        viewId:     selectedView?.id ?? null,
        viewNumber: selectedView?.number ?? null,
        viewName:   selectedView?.name ?? null,
        name,
        slug:       boardSlug({ name, repoName }),
        boardPath:  "",
        repoName,
        originRepo: originRepo || null,
        viewFilter: selectedView?.filter ?? "",
        repoPath:   "",
        columns:    activeCols.map((c) => ({ id: c.id, name: c.name, color: c.color ?? null })),
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

  // ── render ───────────────────────────────────────────────────────────────────

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
                <label className="sf-label">View</label>
                {viewsLoading && <div className="board-select-state">Carregando views…</div>}
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

              {selectedView && (() => {
                const opts = repoOptions(selected, selectedView);
                return (
                  <div className="sf-field">
                    <label className="sf-label">Repositório de Origem</label>
                    {opts.length === 0 ? (
                      <div className="board-select-state">
                        Nenhum repositório detectado no filtro desta view.
                      </div>
                    ) : (
                      <select
                        className="sf-input"
                        value={originRepo}
                        onChange={(e) => setOriginRepo(e.target.value)}
                      >
                        <option value="">Selecione o repositório…</option>
                        {opts.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })()}

              <div className="sf-field">
                <span className="sf-section-title">Colunas ativas</span>
                {columnsLoading && <div className="board-select-state">Carregando colunas…</div>}
                {!columnsLoading && activeCols.length === 0 && (
                  <div className="board-select-state">Nenhuma coluna selecionada.</div>
                )}
                {!columnsLoading && activeCols.length > 0 && (
                  <div className="edit-col-list">
                    {activeCols.map((col, i) => (
                      <div
                        key={colKey(col)}
                        className={`edit-col-item${dragOver === i ? " drag-over" : ""}`}
                        draggable
                        onDragStart={() => onDragStart(i)}
                        onDragEnter={() => onDragEnter(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDrop(i)}
                        onDragEnd={resetDrag}
                      >
                        <span className="col-drag-handle" title="Arrastar para reordenar">⠿</span>
                        <span className="edit-col-name">{col.name}</span>
                        <button
                          className="btn-col-remove"
                          type="button"
                          onClick={() => remove(col)}
                          title="Remover"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!columnsLoading && available.length > 0 && (
                <div className="sf-field">
                  <span className="sf-section-title">Disponíveis</span>
                  <div className="edit-col-available-list">
                    {available.map((col) => (
                      <button
                        key={colKey(col)}
                        className="edit-col-add-item"
                        type="button"
                        onClick={() => add(col)}
                      >
                        <span className="edit-col-add-icon">+</span>
                        {col.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
              disabled={!selected || !boardName || !selectedView || saving || columnsLoading || activeCols.length === 0}
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
