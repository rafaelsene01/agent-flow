"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

export const TLC_LABEL = { spec: "Spec", design: "Design", tasks: "Tasks" };
export const TLC_ICON = { spec: "📋", design: "🎨", tasks: "✅" };

export default function TlcFileModal({ worktreeId, type, onClose }) {
  const [content, setContent] = useState(null); // null = loading
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    fetch(
      `/api/config/worktrees/${encodeURIComponent(worktreeId)}/tlc-file/${type}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setContent(d.content);
      })
      .catch((err) => setError(err.message));
  }, [worktreeId, type]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/config/worktrees/${encodeURIComponent(worktreeId)}/tlc-file/${type}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="backdrop tlc-file-backdrop">
      <div className="modal tlc-file-modal">
        {/* ── top row: title + close ── */}
        <div className="tlc-file-toprow">
          <span className="tlc-file-modal-title">
            <span className="tlc-file-modal-icon">{TLC_ICON[type]}</span>
            {TLC_LABEL[type]}
          </span>
          <button
            className="tlc-file-close"
            type="button"
            onClick={onClose}
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </div>

        {/* ── toolbar: tabs + save ── */}
        <div className="tlc-file-toolbar">
          <div className="tlc-tabs">
            <button
              className={`tlc-tab${!preview ? " tlc-tab--active" : ""}`}
              type="button"
              onClick={() => setPreview(false)}
            >
              ✎ Editar
            </button>
            <button
              className={`tlc-tab${preview ? " tlc-tab--active" : ""}`}
              type="button"
              onClick={() => setPreview(true)}
            >
              ◉ Preview
            </button>
          </div>

          <button
            className="tlc-save-btn"
            type="button"
            onClick={handleSave}
            disabled={saving || content === null}
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>

        {error && <p className="tlc-file-error">⚠ {error}</p>}

        {content === null && !error && (
          <p className="tlc-file-loading">Carregando…</p>
        )}

        {content !== null &&
          (preview ? (
            <div className="tlc-file-preview card-modal-body md">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeHighlight, { detect: false }]]}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              className="tlc-file-editor"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />
          ))}
      </div>
    </div>
  );
}
