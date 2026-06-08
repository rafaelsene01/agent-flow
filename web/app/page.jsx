"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { boardSlug } from "@/lib/boardSlug.js";
import Header from "@/components/Header.jsx";
import SettingsModal from "@/components/SettingsModal.jsx";
import InitBoardModal from "@/components/InitBoardModal.jsx";
import EditBoardModal from "@/components/EditBoardModal.jsx";
import Board from "@/components/Board.jsx";

function AppContent() {
  const router   = useRouter();
  const pathname = usePathname();

  const [initializing, setInitializing]   = useState(true);
  const [showSettings, setShowSettings]   = useState(false);
  const [showInitBoard, setShowInitBoard] = useState(false);
  const [showEditBoard, setShowEditBoard] = useState(false);
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
      const slug    = pathname.slice(1);
      const fromUrl = slug ? saved.find((b) => boardSlug(b) === slug) : null;
      setActiveBoard(fromUrl ?? saved[0] ?? null);
      setInitializing(false);
    }).catch(() => {
      setInitializing(false);
    });
  }, []);

  function selectBoard(board) {
    setActiveBoard(board);
    router.push(`/${boardSlug(board)}`, { scroll: false });
  }

  function handleBoardSaved(newBoard) {
    setBoards((prev) => [...prev, newBoard]);
    setShowInitBoard(false);
    selectBoard(newBoard);
  }

  function handleBoardUpdated(updatedBoard) {
    const next = boards.map((b) => b.id === updatedBoard.id ? updatedBoard : b);
    setBoards(next);
    setActiveBoard(updatedBoard);
    setShowEditBoard(false);
  }

  async function removeBoard(board) {
    const next = boards.filter((b) => b.id !== board.id);
    setBoards(next);

    if (activeBoard?.id === board.id) {
      const fallback = next[0] ?? null;
      setActiveBoard(fallback);
      router.push(fallback ? `/${boardSlug(fallback)}` : "/", { scroll: false });
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
          <div className="board-view-header">
            <div>
              <h2 className="board-view-name">{activeBoard.name}</h2>
              <p className="board-view-repo">{activeBoard.repoName}</p>
            </div>
            <button
              className="btn-edit-board"
              type="button"
              onClick={() => setShowEditBoard(true)}
              title="Editar colunas"
            >
              ✎
            </button>
          </div>
          <Board board={activeBoard} />
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

      {showEditBoard && activeBoard && (
        <EditBoardModal
          board={activeBoard}
          onClose={() => setShowEditBoard(false)}
          onSaved={handleBoardUpdated}
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
