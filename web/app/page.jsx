"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header.jsx";
import SettingsModal from "@/components/SettingsModal.jsx";
import InitBoardModal from "@/components/InitBoardModal.jsx";

export default function App() {
  const [initializing, setInitializing]   = useState(true);
  const [showSettings, setShowSettings]   = useState(false);
  const [showInitBoard, setShowInitBoard] = useState(false);
  const [boards, setBoards]               = useState([]);
  const [activeBoard, setActiveBoard]     = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/status").then((r) => r.json()).catch(() => null),
      fetch("/api/config").then((r) => r.json()).catch(() => ({})),
    ]).then(([status, config]) => {
      if (!status?.github?.connected || !status?.claude?.connected) setShowSettings(true);
      const saved = config.boards ?? [];
      setBoards(saved);
      if (saved.length > 0) setActiveBoard(saved[0]);
    }).finally(() => setInitializing(false));
  }, []);

  function handleBoardSaved(newBoard) {
    setBoards((prev) => [...prev, newBoard]);
    setActiveBoard(newBoard);
    setShowInitBoard(false);
  }

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
        boards={boards}
        activeBoard={activeBoard}
        onSelectBoard={setActiveBoard}
      />

      {activeBoard ? (
        <div className="board-view">
          <h2 className="board-view-name">{activeBoard.name}</h2>
          <p className="board-view-repo">{activeBoard.repoName}</p>
        </div>
      ) : (
        <div className="empty-board">
          <div className="empty-board-inner">
            <span className="empty-logo">🌸</span>
            <h2>Nenhum board inicializado</h2>
            <p>Adicione um repositório GitHub para começar.</p>
            <button
              className="btn-init-board btn-init-board-home"
              type="button"
              onClick={() => setShowInitBoard(true)}
            >
              + Inicializar Board
            </button>
          </div>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showInitBoard && (
        <InitBoardModal
          onClose={() => setShowInitBoard(false)}
          onSaved={handleBoardSaved}
        />
      )}
    </div>
  );
}
