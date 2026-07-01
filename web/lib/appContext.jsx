"use client";

import { createContext, useCallback, useContext, useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { appReducer, initialState } from "@/lib/appReducer.js";
import { boardSlug } from "@/lib/boardSlug.js";
import { useI18n } from "@/lib/i18nContext";
import { useToast } from "@/lib/toast";

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp deve ser usado dentro de <AppProvider>");
  return ctx;
}

// Estado compartilhado por todas as rotas: lista de boards, tema, modais globais
// e os handlers de CRUD/navegação. Fica no layout, então não remonta ao trocar de
// rota (os boards são carregados uma única vez no boot).
export function AppProvider({ children }) {
  const router = useRouter();
  const { t } = useI18n();
  const { toast } = useToast();

  const [state, dispatch] = useReducer(appReducer, initialState);
  const { initializing, boards } = state;

  const [showSettings, setShowSettings]   = useState(false);
  const [showInitBoard, setShowInitBoard] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  // Incrementado após limpar dados do board — força o Board a recarregar as
  // worktrees (senão os cards ficam com bordas/status obsoletos).
  const [worktreeRefresh, setWorktreeRefresh] = useState(0);

  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem("theme") ?? "dark";
  });

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next !== "light");
      localStorage.setItem("theme", next);
      return next;
    });
  }, []);

  // Boot: valida integrações (abre Settings se necessário) e carrega os boards.
  useEffect(() => {
    Promise.all([
      fetch("/api/status").then((r) => r.json()).catch(() => null),
      fetch("/api/config").then((r) => r.json()).catch(() => ({})),
    ]).then(([status, config]) => {
      if (!status?.github?.connected || !status?.claude?.connected) setShowSettings(true);
      dispatch({ type: "INIT_DONE", boards: config.boards ?? [] });
    }).catch(() => {
      dispatch({ type: "INIT_DONE", boards: [] });
    });
  }, []);

  const persistBoards = useCallback((next) =>
    fetch("/api/config", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ boards: next }),
    }), []);

  const goTo = useCallback((path) => router.push(path), [router]);

  // Abre um board. Já estando em /board/*, usa pushState para trocar de board sem
  // recarregar (a rota [slug] permanece montada e lê o novo slug do pathname).
  // Vindo de outra rota, navega de verdade para a rota do board.
  const selectBoard = useCallback((board) => {
    const path = `/board/${boardSlug(board)}`;
    if (window.location.pathname.startsWith("/board/")) {
      window.history.pushState(null, "", path);
    } else {
      router.push(path);
    }
  }, [router]);

  const openSettings   = useCallback(() => setShowSettings(true), []);
  const closeSettings  = useCallback(() => setShowSettings(false), []);
  const openInitBoard  = useCallback(() => setShowInitBoard(true), []);
  const closeInitBoard = useCallback(() => setShowInitBoard(false), []);

  const handleBoardSaved = useCallback((newBoard) => {
    dispatch({ type: "BOARD_ADDED", board: newBoard });
    setShowInitBoard(false);
    router.push(`/board/${boardSlug(newBoard)}`);
  }, [router]);

  const handleBoardUpdated = useCallback(async (updatedBoard) => {
    dispatch({ type: "BOARD_UPDATED", board: updatedBoard });
    const next = boards.map((b) => b.viewId === updatedBoard.viewId ? updatedBoard : b);
    await persistBoards(next).catch(() => {});
  }, [boards, persistBoards]);

  const cleanupBoardData = useCallback(async (board) => {
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
        return;
      }
      setWorktreeRefresh((n) => n + 1);
    } catch (err) {
      console.error("[cleanup-board]", err);
      toast({ title: t("toast.cleanup.error"), description: err.message, variant: "error" });
    }
  }, [t, toast]);

  const removeBoard = useCallback((board) => setRemoveConfirm({ board }), []);
  const cancelRemove = useCallback(() => setRemoveConfirm(null), []);

  const confirmRemoveBoard = useCallback(async () => {
    const board = removeConfirm.board;
    setRemoveConfirm(null);
    await cleanupBoardData(board);
    const next = boards.filter((b) => b.viewId !== board.viewId);
    dispatch({ type: "BOARD_REMOVED", boardViewId: board.viewId });
    router.push("/board");
    await persistBoards(next).catch(() => {});
  }, [removeConfirm, boards, cleanupBoardData, persistBoards, router]);

  const value = {
    initializing, boards, theme, worktreeRefresh,
    toggleTheme, goTo, selectBoard,
    openSettings, closeSettings, showSettings,
    openInitBoard, closeInitBoard, showInitBoard, handleBoardSaved,
    handleBoardUpdated, cleanupBoardData,
    removeBoard, cancelRemove, removeConfirm, confirmRemoveBoard,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
