"use client";

import { useEffect, useState } from "react";

// Permite: letras ASCII, dígitos, hífen, underscore, barra, ponto.
// Rejeita: acentos, ç e qualquer outra pontuação.
const ALLOWED = /^[a-zA-Z0-9\-_.\/]+$/;

function validateBranchName(name) {
  if (!name) return "Nome obrigatório";
  if (name.length > 250) return "Máximo de 250 caracteres";
  if (!ALLOWED.test(name))
    return "Apenas letras (sem acentos ou ç), números, hífens, underscores, pontos e barras";
  if (name.startsWith("/") || name.endsWith("/")) return "Não pode começar ou terminar com /";
  if (name.includes("//")) return "Não pode conter //";
  if (name.startsWith(".") || name.endsWith(".")) return "Não pode começar ou terminar com ponto";
  if (name.endsWith(".lock")) return "Não pode terminar com .lock";
  if (name.includes("..")) return "Não pode conter dois pontos consecutivos (..)";
  if (name === "@") return "Nome inválido";
  if (name.startsWith("-")) return "Não pode começar com hífen";
  return null;
}

export default function CreateBranchModal({ board, onClose }) {
  const [owner, repo] = (board.originRepo ?? "").split("/");

  const [branches, setBranches]               = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError]     = useState(null);
  const [originBranch, setOriginBranch]       = useState(null);

  const [newBranch, setNewBranch]       = useState("");
  const [nameError, setNameError]       = useState(null);
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState(null);
  const [lastCreated, setLastCreated]   = useState(null);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    if (!owner || !repo) return;
    setBranchesLoading(true);
    fetch(`/api/github/repos/${owner}/${repo}/branches`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setBranches(data);
      })
      .catch((err) => setBranchesError(err.message))
      .finally(() => setBranchesLoading(false));
  }, [owner, repo]);

  function handleNameChange(e) {
    const val = e.target.value;
    setNewBranch(val);
    setNameError(val ? validateBranchName(val) : null);
    setCreateError(null);
    setLastCreated(null);
  }

  async function handleCreate() {
    const err = validateBranchName(newBranch);
    if (err) { setNameError(err); return; }
    if (!originBranch) return;

    setCreating(true);
    setCreateError(null);
    try {
      const res  = await fetch(`/api/github/repos/${owner}/${repo}/branches`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ newBranch, originBranch }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLastCreated(newBranch);
      setNewBranch("");
      setNameError(null);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const validationError = newBranch ? validateBranchName(newBranch) : null;
  const canCreate = owner && repo && originBranch && newBranch && !validationError && !creating;

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal create-branch-modal">
        <div className="modal-header">
          <div className="modal-id-row">
            <span className="cb-modal-icon">⎇</span>
            <h2 className="modal-title" style={{ fontSize: 15, marginBottom: 0 }}>
              Criar Branch
            </h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose}>✕</button>
        </div>

        <div className="sf-body cb-body">

          {/* ── Repositório ── */}
          <div className="sf-field">
            <label className="sf-label">Repositório</label>
            {!board.originRepo ? (
              <div className="board-select-state err">
                Nenhum repositório de origem configurado. Edite o board para definir um.
              </div>
            ) : (
              <div className="cb-repo-chip">
                <span className="cb-repo-icon">⎗</span>
                <span className="cb-repo-name">{board.originRepo}</span>
              </div>
            )}
          </div>

          {/* ── Branch de Origem ── */}
          {board.originRepo && (
            <div className="sf-field">
              <label className="sf-label">Branch de Origem</label>

              {branchesLoading && (
                <div className="board-select-state">Carregando branches…</div>
              )}
              {branchesError && (
                <div className="board-select-state err">{branchesError}</div>
              )}
              {!branchesLoading && !branchesError && branches.length === 0 && (
                <div className="board-select-state">Nenhuma branch encontrada.</div>
              )}
              {!branchesLoading && !branchesError && branches.length > 0 && (
                <div className="board-select-list cb-branches-list">
                  {branches.map((b) => (
                    <button
                      key={b.name}
                      className={`board-select-item${originBranch === b.name ? " selected" : ""}`}
                      type="button"
                      onClick={() => setOriginBranch(b.name)}
                    >
                      <span className="board-select-title cb-branch-name">
                        <span className="cb-branch-dot" />
                        {b.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Nome da nova branch ── */}
          {board.originRepo && (
            <div className="sf-field">
              <label className="sf-label">Nome da Nova Branch</label>
              <input
                className={`sf-input mono${nameError ? " cb-input-error" : ""}`}
                type="text"
                placeholder="ex: feature/minha-tarefa"
                value={newBranch}
                onChange={handleNameChange}
                disabled={creating}
                autoComplete="off"
                spellCheck="false"
              />
              {nameError && <span className="sf-hint err">{nameError}</span>}
              {!nameError && newBranch && (
                <span className="sf-hint ok">Nome válido ✓</span>
              )}
            </div>
          )}

          {/* ── Feedback ── */}
          {createError && (
            <p className="sf-hint err cb-feedback">{createError}</p>
          )}
          {lastCreated && (
            <p className="sf-hint ok cb-feedback">
              Branch <code className="cb-inline-code">{lastCreated}</code> criada com sucesso ✓
            </p>
          )}

        </div>

        <div className="sf-footer">
          <div className="sf-footer-actions">
            <button className="btn-secondary" type="button" onClick={onClose}>
              Fechar
            </button>
            {board.originRepo && (
              <button
                className="btn-primary"
                type="button"
                disabled={!canCreate}
                onClick={handleCreate}
              >
                {creating ? "Criando…" : "Criar Branch"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
