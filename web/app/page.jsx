"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header.jsx";
import SettingsModal from "@/components/SettingsModal.jsx";

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showInitBoard, setShowInitBoard] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => {
        if (!s.github?.connected || !s.claude?.connected) setShowSettings(true);
      })
      .catch(() => setShowSettings(true))
      .finally(() => setInitializing(false));
  }, []);

  if (initializing) {
    return (
      <div className="init-screen">
        <span className="init-logo">🌸</span>
        <p className="init-msg">Verificando integrações…</p>
        <div className="loader">
          <span className="loader-dot" />
          <span className="loader-dot" />
          <span className="loader-dot" />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        onSettings={() => setShowSettings(true)}
        onInitBoard={() => setShowInitBoard(true)}
      />

      <div className="empty-board">
        <div className="empty-board-inner">
          <span className="empty-logo">🌸</span>
          <h2>Nenhum board inicializado</h2>
          <p>Configure o projeto para começar a usar o board Kanban.</p>
          <button
            className="btn-init-board btn-init-board-home"
            type="button"
            onClick={() => setShowInitBoard(true)}
          >
            + Inicializar Board
          </button>
        </div>
      </div>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {showInitBoard && (
        <div>{/* TODO: fluxo de inicialização de board */}</div>
      )}
    </div>
  );
}
