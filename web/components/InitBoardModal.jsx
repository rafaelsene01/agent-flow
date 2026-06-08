"use client";

import { useEffect, useState } from "react";

export default function InitBoardModal({ onClose, onSaved }) {
  const [boards, setBoards]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState(null);
  const [missingScope, setMissingScope] = useState(false);
  const [selected, setSelected]     = useState(null);
  const [boardName, setBoardName]   = useState("");
  const [saving, setSaving]         = useState(false);

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
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const [configRes] = await Promise.all([fetch("/api/config")]);
      const config = await configRes.json();
      const existing = config.boards ?? [];

      const repo = selected.repos[0] ?? null;
      const newBoard = {
        id:       selected.id,
        name:     boardName || selected.title,
        boardPath: "",
        repoName: repo?.fullName ?? "",
        repoPath: "",
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

  const repo = selected?.repos[0] ?? null;

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
                    <span className="board-select-meta">
                      #{b.number} · {b.repos.length} repo{b.repos.length !== 1 ? "s" : ""}
                    </span>
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

              <div className="board-repo-info">
                <span className="sf-label" style={{ display: "block", marginBottom: 6 }}>
                  Repositório detectado
                </span>
                {repo ? (
                  <div className="board-repo-card">
                    <span className="board-repo-name">{repo.fullName}</span>
                    <span className="board-repo-url">{repo.cloneUrl}</span>
                  </div>
                ) : (
                  <div className="board-select-state" style={{ padding: "10px 0" }}>
                    Nenhum repositório vinculado a este board.
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
              disabled={!selected || !boardName || saving}
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
