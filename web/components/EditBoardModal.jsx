"use client";

import { useEffect, useRef, useState } from "react";

export default function EditBoardModal({ board, onClose, onSaved }) {
  const [allCols, setAllCols]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeCols, setActiveCols] = useState(board.columns ?? []);
  const [saving, setSaving]         = useState(false);
  const [dragOver, setDragOver]     = useState(null);
  const dragIdx = useRef(null);

  useEffect(() => {
    fetch(`/api/github/boards/${encodeURIComponent(board.id)}/columns`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setAllCols(data.map((c) => c.name)); })
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

  function remove(name) {
    setActiveCols((prev) => prev.filter((c) => c !== name));
  }

  function add(name) {
    setActiveCols((prev) => [...prev, name]);
  }

  const available = allCols.filter((c) => !activeCols.includes(c));

  async function save() {
    setSaving(true);
    try {
      const configRes = await fetch("/api/config");
      const config = await configRes.json();
      const boards = (config.boards ?? []).map((b) =>
        b.id === board.id ? { ...b, columns: activeCols } : b
      );
      await fetch("/api/config", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ boards }),
      });
      onSaved({ ...board, columns: activeCols });
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal init-board-modal" onClick={(e) => e.stopPropagation()}>

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
            <span className="sf-section-title">Colunas ativas</span>
            {activeCols.length === 0 ? (
              <div className="board-select-state">Nenhuma coluna ativa.</div>
            ) : (
              <div className="edit-col-list">
                {activeCols.map((name, i) => (
                  <div
                    key={name}
                    className={`edit-col-item${dragOver === i ? " drag-over" : ""}`}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragEnter={() => onDragEnter(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(i)}
                    onDragEnd={reset}
                  >
                    <span className="col-drag-handle" title="Arrastar para reordenar">⠿</span>
                    <span className="edit-col-name">{name}</span>
                    <button
                      className="btn-col-remove"
                      type="button"
                      onClick={() => remove(name)}
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
                {available.map((name) => (
                  <button
                    key={name}
                    className="edit-col-add-item"
                    type="button"
                    onClick={() => add(name)}
                  >
                    <span className="edit-col-add-icon">+</span>
                    {name}
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
