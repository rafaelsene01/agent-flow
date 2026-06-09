"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { boardSlug } from "@/lib/boardSlug.js";
import Header from "@/components/Header.jsx";
import SettingsModal from "@/components/SettingsModal.jsx";
import InitBoardModal from "@/components/InitBoardModal.jsx";
import EditBoardModal from "@/components/EditBoardModal.jsx";
import Board from "@/components/Board.jsx";

function navigate(path) {
  window.history.pushState(null, "", path);
}

function AppContent() {
  const pathname = usePathname();

  const [activePath,    setActivePath]    = useState(pathname);
  const [initializing, setInitializing]   = useState(true);
  const [showSettings, setShowSettings]   = useState(false);
  const [showInitBoard, setShowInitBoard] = useState(false);
  const [showEditBoard, setShowEditBoard] = useState(false);
  const [boards, setBoards]               = useState([]);
  const [activeBoard, setActiveBoard]     = useState(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem("theme") ?? "dark";
  });

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  // Sincroniza activePath com botões de voltar/avançar do browser.
  useEffect(() => {
    const onPop = () => setActivePath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/status").then((r) => r.json()).catch(() => null),
      fetch("/api/config").then((r) => r.json()).catch(() => ({})),
    ]).then(([status, config]) => {
      if (!status?.github?.connected || !status?.claude?.connected) setShowSettings(true);
      const saved = config.boards ?? [];
      setBoards(saved);

      const slug    = activePath.slice(1);
      const fromUrl = slug ? saved.find((b) => boardSlug(b) === slug) : null;
      const initial = fromUrl ?? saved[0] ?? null;
      setActiveBoard(initial);

      // Se carregou na raiz "/", redireciona para o slug do primeiro board.
      if (!slug && initial) {
        const path = `/${boardSlug(initial)}`;
        setActivePath(path);
        window.history.replaceState(null, "", path);
      }

      setInitializing(false);
    }).catch(() => {
      setInitializing(false);
    });
  }, []);

  function selectBoard(board) {
    setActiveBoard(board);
    const path = `/${boardSlug(board)}`;
    setActivePath(path);
    navigate(path);
  }

  function handleBoardSaved(newBoard) {
    setBoards((prev) => [...prev, newBoard]);
    setShowInitBoard(false);
    selectBoard(newBoard);
  }

  async function handleBoardUpdated(updatedBoard) {
    const next = boards.map((b) => b.viewId === updatedBoard.viewId ? updatedBoard : b);
    setBoards(next);
    setActiveBoard(updatedBoard);
    setShowEditBoard(false);
    await fetch("/api/config", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ boards: next }),
    });
  }

  async function removeBoard(board) {
    const next = boards.filter((b) => b.viewId !== board.viewId);
    setBoards(next);

    if (activeBoard?.viewId === board.viewId) {
      const fallback = next[0] ?? null;
      setActiveBoard(fallback);
      const path = fallback ? `/${boardSlug(fallback)}` : "/";
      setActivePath(path);
      navigate(path);
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
        activePath={activePath}
        onSelectBoard={selectBoard}
        onRemoveBoard={removeBoard}
        theme={theme}
        onToggleTheme={toggleTheme}
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
