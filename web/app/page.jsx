"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header.jsx";
import SettingsModal from "@/components/SettingsModal.jsx";
import InitBoardModal from "@/components/InitBoardModal.jsx";

function AppContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

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

      const boardId   = searchParams.get("board");
      const fromUrl   = boardId ? saved.find((b) => b.id === boardId) : null;
      setActiveBoard(fromUrl ?? saved[0] ?? null);
    }).finally(() => setInitializing(false));
  }, []);

  function selectBoard(board) {
    setActiveBoard(board);
    router.push(`?board=${board.id}`, { scroll: false });
  }

  function handleBoardSaved(newBoard) {
    setBoards((prev) => [...prev, newBoard]);
    setShowInitBoard(false);
    selectBoard(newBoard);
  }

  async function removeBoard(board) {
    const next = boards.filter((b) => b.id !== board.id);
    setBoards(next);

    if (activeBoard?.id === board.id) {
      const fallback = next[0] ?? null;
      setActiveBoard(fallback);
      router.push(fallback ? `?board=${fallback.id}` : "/", { scroll: false });
    }

    await fetch("/api/config", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ boards: next }),
    });
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
        onSelectBoard={selectBoard}
        onRemoveBoard={removeBoard}
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

export default function App() {
  return (
    <Suspense>
      <AppContent />
    </Suspense>
  );
}
