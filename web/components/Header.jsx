"use client";

export default function Header({ onSettings, onInitBoard }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="logo">🌸</span>
        <h1>Agent Flow</h1>
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
