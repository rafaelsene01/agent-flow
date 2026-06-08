"use client";

import { useEffect, useRef, useState } from "react";

function BoardNav({ boards, activeBoard, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className="board-nav" ref={ref}>
      <button
        className="board-nav-btn"
        type="button"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{activeBoard?.name ?? "Selecionar Board"}</span>
        <span className="board-nav-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="board-nav-dropdown">
          {boards.map((b) => (
            <button
              key={b.id}
              className={`board-nav-item${activeBoard?.id === b.id ? " active" : ""}`}
              type="button"
              onClick={() => { onSelect(b); setOpen(false); }}
            >
              <span className="board-nav-item-name">{b.name}</span>
              <span className="board-nav-item-repo">{b.repoName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header({ onSettings, onInitBoard, boards = [], activeBoard, onSelectBoard }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="logo">🌸</span>
        <h1>Agent Flow</h1>

        {boards.length > 0 && (
          <BoardNav boards={boards} activeBoard={activeBoard} onSelect={onSelectBoard} />
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
