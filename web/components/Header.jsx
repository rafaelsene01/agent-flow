"use client";

export default function Header({ onSettings }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="logo">🌸</span>
        <h1>Agent Flow</h1>
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
