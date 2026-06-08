"use client";

import { boardSlug } from "@/lib/boardSlug.js";

export default function Header({ onSettings, onInitBoard, boards = [], activePath = "", onSelectBoard, onRemoveBoard }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="logo">🌸</span>
        <h1>Agent Flow</h1>

        {boards.length > 0 && (
          <nav className="board-tabs">
            {boards.map((b) => (
              <button
                key={b.viewId ?? b.id}
                className={`board-tab${boardSlug(b) === activePath.slice(1) ? " active" : ""}`}
                type="button"
                onClick={() => onSelectBoard(b)}
              >
                {b.repoName ? b.repoName.split("/").pop() : b.name}
                <span
                  className="board-tab-close"
                  role="button"
                  title="Remover board"
                  onClick={(e) => { e.stopPropagation(); onRemoveBoard(b); }}
                >
                  ×
                </span>
              </button>
            ))}
          </nav>
        )}

        <button
          className="btn-init-board"
          type="button"
          onClick={onInitBoard}
          title="Inicializar Board"
        >
          +
        </button>
      </div>

      <div className="topbar-right">
        <button
          className="btn-settings"
          type="button"
          onClick={onSettings}
          title="Configurações"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
