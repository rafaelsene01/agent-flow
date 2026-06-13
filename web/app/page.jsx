"use client";

import { Suspense, useEffect, useReducer, useState } from "react";
import { usePathname } from "next/navigation";
import { boardSlug } from "@/lib/boardSlug.js";
import { appReducer, initialState } from "@/lib/appReducer.js";
import Header from "@/components/Header.jsx";
import SettingsModal from "@/components/SettingsModal.jsx";
import InitBoardModal from "@/components/InitBoardModal.jsx";
import EditBoardModal from "@/components/EditBoardModal.jsx";
import Board from "@/components/board/Board.jsx";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Plus } from "lucide-react";

function navigate(path) {
  window.history.pushState(null, "", path);
}

function AppContent() {
  const pathname = usePathname();
  const [state, dispatch] = useReducer(appReducer, { ...initialState, activePath: pathname });
  const { initializing, boards, activeBoard, activePath } = state;

  const [showSettings, setShowSettings]   = useState(false);
  const [showInitBoard, setShowInitBoard] = useState(false);
  const [showEditBoard, setShowEditBoard] = useState(false);

  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem("theme") ?? "dark";
  });

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next !== "light");
    localStorage.setItem("theme", next);
  }

  useEffect(() => {
    const onPop = () => dispatch({ type: "SET_PATH", path: window.location.pathname });
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

      const slug    = pathname.slice(1);
      const fromUrl = slug ? saved.find((b) => boardSlug(b) === slug) : null;
      const initial = fromUrl ?? saved[0] ?? null;

      let newPath = pathname;
      if (!slug && initial) {
        newPath = `/${boardSlug(initial)}`;
        window.history.replaceState(null, "", newPath);
      }

      dispatch({ type: "INIT_DONE", boards: saved, activeBoard: initial, activePath: newPath });
    }).catch(() => {
      dispatch({ type: "INIT_DONE", boards: [], activeBoard: null, activePath: pathname });
    });
  }, []);

  function selectBoard(board) {
    const path = `/${boardSlug(board)}`;
    dispatch({ type: "SELECT_BOARD", board, path });
    navigate(path);
  }

  function handleBoardSaved(newBoard) {
    dispatch({ type: "BOARD_ADDED", board: newBoard });
    setShowInitBoard(false);
    navigate(`/${boardSlug(newBoard)}`);
  }

  async function handleBoardUpdated(updatedBoard) {
    const next = boards.map((b) => b.viewId === updatedBoard.viewId ? updatedBoard : b);
    dispatch({ type: "BOARD_UPDATED", board: updatedBoard });
    setShowEditBoard(false);
    await fetch("/api/config", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ boards: next }),
    });
  }

  async function cleanupBoardData(board) {
    if (!board.originRepo) return;
    try {
      const res = await fetch("/api/config/cleanup-board", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ originRepo: board.originRepo }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error("[cleanup-board] server error:", d.error);
      }
    } catch (err) {
      console.error("[cleanup-board]", err);
    }
  }

  async function removeBoard(board) {
    if (!confirm(`Excluir o board "${board.name}" e todos os worktrees e repositório associados? Esta ação não pode ser desfeita.`)) return;

    await cleanupBoardData(board);

    const next = boards.filter((b) => b.viewId !== board.viewId);
    const fallback = next[0] ?? null;
    const fallbackPath = fallback ? `/${boardSlug(fallback)}` : "/";

    dispatch({ type: "BOARD_REMOVED", boardViewId: board.viewId, fallbackBoard: fallback, fallbackPath });
    navigate(fallbackPath);

    await fetch("/api/config", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ boards: next }),
    });
  }

  if (initializing) {
    return (
      <div className="flex flex-1 min-h-screen flex-col items-center justify-center gap-4">
        <span className="text-5xl">🌸</span>
        <p className="text-sm text-muted-foreground">Verificando integrações…</p>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground animate-pulse [animation-delay:0ms]" />
          <span className="size-2 rounded-full bg-muted-foreground animate-pulse [animation-delay:150ms]" />
          <span className="size-2 rounded-full bg-muted-foreground animate-pulse [animation-delay:300ms]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
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
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <div>
              <h2 className="text-sm font-bold leading-tight">{activeBoard.name}</h2>
              <p className="text-xs text-muted-foreground">{activeBoard.repoName}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                onClick={() => setShowEditBoard(true)}
                title="Editar colunas"
              >
                <Pencil />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                type="button"
                title="Apagar repositório e worktrees deste board"
                className="hover:text-destructive hover:border-destructive"
                onClick={async () => {
                  if (!confirm(`Apagar o repositório e todos os worktrees do board "${activeBoard.name}"?\nO board permanece na lista. Esta ação não pode ser desfeita.`)) return;
                  await cleanupBoardData(activeBoard);
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
          <Board board={activeBoard} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="text-5xl">🌸</span>
            <h2 className="text-base font-semibold">Nenhum board inicializado</h2>
            <p className="text-sm text-muted-foreground">Adicione um repositório GitHub para começar.</p>
            <Button
              type="button"
              onClick={() => setShowInitBoard(true)}
            >
              <Plus />
              Inicializar Board
            </Button>
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
