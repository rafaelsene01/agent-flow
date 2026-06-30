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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FlowerMark } from "@/components/ui/flower-mark";
import { Pencil, BrushCleaning, Plus, Search, X, CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18nContext";
import { useToast } from "@/lib/toast";

function navigate(path) {
  window.history.pushState(null, "", path);
}

function AppContent() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { toast } = useToast();
  const [state, dispatch] = useReducer(appReducer, { ...initialState, activePath: pathname });
  const { initializing, boards, activeBoard, activePath } = state;

  const [showSettings, setShowSettings]   = useState(false);
  const [showInitBoard, setShowInitBoard] = useState(false);
  const [showEditBoard, setShowEditBoard] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [cleanupConfirm, setCleanupConfirm] = useState(false);

  // Edição inline do filtro da view (com debounce antes de relistar/persistir).
  const [filterDraft, setFilterDraft] = useState(activeBoard?.viewFilter ?? "");

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

  // O Next App Router já faz o patch de pushState/replaceState e mantém o
  // usePathname() em sincronia (inclusive em voltar/avançar). Basta espelhar a
  // mudança de rota no reducer — patchar history aqui colidia com o patch
  // interno do Next e disparava "useInsertionEffect must not schedule updates".
  useEffect(() => {
    dispatch({ type: "SET_PATH", path: pathname });
  }, [pathname]);

  // Mantém o rascunho do filtro alinhado ao board ativo (ex: troca de tab).
  useEffect(() => {
    setFilterDraft(activeBoard?.viewFilter ?? "");
  }, [activeBoard?.viewId]);

  // Debounce de 500ms: aplica o filtro editado, relista os cards e persiste.
  useEffect(() => {
    if (!activeBoard) return;
    if (filterDraft === (activeBoard.viewFilter ?? "")) return;
    const timer = setTimeout(() => {
      const updated = { ...activeBoard, viewFilter: filterDraft.trim() };
      const next    = boards.map((b) => b.viewId === updated.viewId ? updated : b);
      dispatch({ type: "BOARD_UPDATED", board: updated });
      fetch("/api/config", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ boards: next }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [filterDraft, activeBoard, boards]);

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
        toast({ title: t("toast.cleanup.error"), description: d.error ?? "Erro do servidor", variant: "error" });
      }
    } catch (err) {
      console.error("[cleanup-board]", err);
      toast({ title: t("toast.cleanup.error"), description: err.message, variant: "error" });
    }
  }

  async function removeBoard(board) {
    setRemoveConfirm({ board });
  }

  async function confirmRemoveBoard() {
    const board = removeConfirm.board;
    setRemoveConfirm(null);
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
        <FlowerMark className="size-12" />
        <p className="text-sm text-muted-foreground">{t("board.initializing")}</p>
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
            <div className="min-w-0 flex-1 flex items-center gap-3">
              <div className="relative flex items-center flex-1 min-w-0 max-w-xl">
                <Search className="absolute left-0 size-3 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={filterDraft}
                  onChange={(e) => setFilterDraft(e.target.value)}
                  spellCheck={false}
                  placeholder={t("board.filter.placeholder")}
                  aria-label={t("board.filter.label")}
                  className="w-full bg-transparent text-xs text-muted-foreground font-mono outline-none border-b border-transparent hover:border-border focus:border-ring transition-colors py-0.5 pl-5 pr-5"
                />
                {filterDraft && (
                  <button
                    type="button"
                    onClick={() => setFilterDraft("")}
                    className="absolute right-5 text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    aria-label={t("board.filter.clear")}
                  >
                    <X className="size-3" />
                  </button>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="absolute right-0 text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        aria-label={t("board.filter.help.title")}
                      >
                        <CircleHelp className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="max-w-xs">
                      <p className="mb-1 font-semibold">{t("board.filter.help.title")}</p>
                      <ul className="flex flex-col gap-0.5 font-mono">
                        <li>{t("board.filter.help.repo")}</li>
                        <li>{t("board.filter.help.label")}</li>
                        <li>{t("board.filter.help.text")}</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                onClick={() => setShowEditBoard(true)}
                title={t("board.edit.columns")}
              >
                <Pencil />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                type="button"
                title={t("board.cleanup.title")}
                className="hover:text-destructive hover:border-destructive"
                onClick={() => setCleanupConfirm(true)}
              >
                <BrushCleaning />
              </Button>
            </div>
          </div>
          <Board board={activeBoard} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <FlowerMark className="size-12" />
            <h2 className="text-base font-semibold">{t("board.none")}</h2>
            <p className="text-sm text-muted-foreground">{t("board.none.desc")}</p>
            <Button
              type="button"
              onClick={() => setShowInitBoard(true)}
            >
              <Plus />
              {t("board.init")}
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

      {removeConfirm && (
        <ConfirmDialog
          open
          targetName={removeConfirm.board.name}
          title={t("confirm.remove.board")}
          description={t("board.remove.confirm")}
          destructive
          onConfirm={confirmRemoveBoard}
          onCancel={() => setRemoveConfirm(null)}
        />
      )}
      {cleanupConfirm && activeBoard && (
        <ConfirmDialog
          open
          targetName={activeBoard.name}
          title={t("confirm.cleanup.board")}
          description={t("board.cleanup.confirm")}
          destructive
          onConfirm={async () => { setCleanupConfirm(false); await cleanupBoardData(activeBoard); }}
          onCancel={() => setCleanupConfirm(false)}
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
