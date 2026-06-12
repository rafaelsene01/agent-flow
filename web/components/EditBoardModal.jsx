"use client";

import { useEffect, useRef, useState } from "react";

// Normaliza string legada para { id: null, name } ou mantém { id, name }.
function normalizeCol(c) {
  return typeof c === "string" ? { id: null, name: c } : c;
}

function colKey(c) {
  return c.id ?? c.name;
}

export default function EditBoardModal({ board, onClose, onSaved }) {
  const [allCols, setAllCols]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeCols, setActiveCols] = useState(
    (board.columns ?? []).map(normalizeCol)
  );
  const [saving]                    = useState(false);
  const [dragOver, setDragOver]     = useState(null);
  const [originRepo, setOriginRepo] = useState(board.originRepo ?? "");
  const dragIdx = useRef(null);

  // Repos derivados do repoName salvo no config (fonte confiável)
  const repoOptions = (board.repoName ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  useEffect(() => {
    fetch(`/api/github/boards/${encodeURIComponent(board.id)}/columns`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          const apiCols = data.map((c) => ({ id: c.id, name: c.name }));
          setAllCols(apiCols);
          // Migra colunas salvas como string (id: null) para o formato { id, name }
          // fazendo match por nome com as opções reais da API.
          setActiveCols((prev) =>
            prev.map((ac) =>
              ac.id ? ac : (apiCols.find((c) => c.name === ac.name) ?? ac)
            )
          );
        }
      })
      .finally(() => setLoading(false));
  }, [board.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  function onDragStart(i) {
    dragIdx.current = i;
  }

  function onDragEnter(i) {
    setDragOver(i);
  }

  function onDrop(i) {
    const from = dragIdx.current;
    if (from === null || from === i) { reset(); return; }
    const next = [...activeCols];
    const [item] = next.splice(from, 1);
    next.splice(i, 0, item);
    setActiveCols(next);
    reset();
  }

  function reset() {
    dragIdx.current = null;
    setDragOver(null);
  }

  function remove(col) {
    setActiveCols((prev) => prev.filter((c) => colKey(c) !== colKey(col)));
  }

  function add(col) {
    setActiveCols((prev) => [...prev, col]);
  }

  // Compara por ID quando disponível, senão por nome (compat com configs antigos).
  const available = allCols.filter((apiCol) =>
    !activeCols.some((ac) =>
      (ac.id && ac.id === apiCol.id) || ac.name === apiCol.name
    )
  );

  function save() {
    onSaved({ ...board, columns: activeCols, originRepo: originRepo || null });
  }

  return (
    <div className="backdrop">
      <div className="modal init-board-modal">

        <div className="modal-header">
          <div className="modal-id-row">
            <span style={{ fontSize: 16 }}>✎</span>
            <h2 className="modal-title" style={{ fontSize: 16, marginBottom: 0 }}>
              {board.name}
            </h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose}>✕</button>
        </div>

        <div className="sf-body">

          <div className="sf-field">
            <label className="sf-label">Repositório de Origem</label>
            {repoOptions.length === 0 ? (
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
                {repoOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            )}
          </div>

          <div className="sf-field">
            <span className="sf-section-title">Colunas ativas</span>
            {activeCols.length === 0 ? (
              <div className="board-select-state">Nenhuma coluna ativa.</div>
            ) : (
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
                    onDragEnd={reset}
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

          {!loading && available.length > 0 && (
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

        </div>

        <div className="sf-footer">
          <div className="sf-footer-actions">
            <button className="btn-secondary" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              type="button"
              disabled={saving || activeCols.length === 0}
              onClick={save}
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
