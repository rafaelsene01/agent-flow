"use client";

export default function Header({ onSettings, onInitBoard, boards = [], activeBoard, onSelectBoard }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="logo">🌸</span>
        <h1>Agent Flow</h1>

        {boards.length > 0 && (
          <nav className="board-tabs">
            {boards.map((b) => (
              <button
                key={b.id}
                className={`board-tab${activeBoard?.id === b.id ? " active" : ""}`}
                type="button"
                onClick={() => onSelectBoard(b)}
              >
                {b.name}
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
