"use client";

import { useEffect, useState } from "react";
import Board from "@/components/board/Board.jsx";
import EditBoardModal from "@/components/EditBoardModal.jsx";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pencil, BrushCleaning, Search, X, CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18nContext";

/**
 * Página de um board (rota "/board/<slug>"): header com filtro/edição/limpeza
 * + o Board em si. Concentra o estado específico do board (rascunho do filtro
 * com debounce, modal de edição de colunas e confirmação de limpeza).
 *
 * A persistência (dispatch + POST /api/config) e a limpeza de worktrees ficam no
 * App, expostas via onBoardUpdated/onCleanup — assim o mesmo fluxo serve tanto a
 * edição inline daqui quanto a remoção disparada pela sidebar.
 */
export default function BoardView({ board, onBoardUpdated, onCleanup, refreshSignal }) {
  const { t } = useI18n();
  const [filterDraft, setFilterDraft]     = useState(board?.viewFilter ?? "");
  const [boardToEdit, setBoardToEdit]     = useState(null);
  const [cleanupTarget, setCleanupTarget] = useState(null);

  // Mantém o rascunho do filtro alinhado ao board ativo (ex: troca de board).
  useEffect(() => {
    setFilterDraft(board?.viewFilter ?? "");
  }, [board?.viewId]);

  // Debounce de 500ms: aplica o filtro editado, relista os cards e persiste.
  useEffect(() => {
    if (!board) return;
    if (filterDraft === (board.viewFilter ?? "")) return;
    const timer = setTimeout(() => {
      onBoardUpdated({ ...board, viewFilter: filterDraft.trim() });
    }, 500);
    return () => clearTimeout(timer);
  }, [filterDraft, board, onBoardUpdated]);

  return (
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
            onClick={() => setBoardToEdit(board)}
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
            onClick={() => setCleanupTarget(board)}
          >
            <BrushCleaning />
          </Button>
        </div>
      </div>
      <Board board={board} refreshSignal={refreshSignal} />

      {boardToEdit && (
        <EditBoardModal
          board={boardToEdit}
          onClose={() => setBoardToEdit(null)}
          onSaved={(updated) => { onBoardUpdated(updated); setBoardToEdit(null); }}
        />
      )}
      {cleanupTarget && (
        <ConfirmDialog
          open
          targetName={cleanupTarget.name}
          title={t("confirm.cleanup.board")}
          description={t("board.cleanup.confirm")}
          destructive
          onConfirm={async () => { const b = cleanupTarget; setCleanupTarget(null); await onCleanup(b); }}
          onCancel={() => setCleanupTarget(null)}
        />
      )}
    </div>
  );
}
