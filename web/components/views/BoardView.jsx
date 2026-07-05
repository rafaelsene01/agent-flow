"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Board from "@/components/board/Board.jsx";
import EditBoardModal from "@/components/EditBoardModal.jsx";
import BoardChatModal from "@/components/BoardChatModal.jsx";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pencil, BrushCleaning, Search, X, CircleHelp, MessageSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
  const [chatOpen, setChatOpen]           = useState(false);
  const [cleanupTarget, setCleanupTarget] = useState(null);
  // Assignees reportados por cada coluna ("colKey" -> lista) + login selecionado.
  const [columnAssignees, setColumnAssignees] = useState({});
  const [assigneeFilter, setAssigneeFilter]   = useState(null);

  // Mantém o rascunho do filtro alinhado ao board ativo (ex: troca de board).
  useEffect(() => {
    setFilterDraft(board?.viewFilter ?? "");
    setColumnAssignees({});
    setAssigneeFilter(null);
  }, [board?.viewId]);

  // Callback estável para as colunas reportarem seus assignees carregados.
  const reportColumnAssignees = useCallback((colKey, list) => {
    setColumnAssignees((prev) => ({ ...prev, [colKey]: list }));
  }, []);

  const assignees = useMemo(() => {
    const map = new Map();
    for (const list of Object.values(columnAssignees)) {
      for (const a of list) if (!map.has(a.login)) map.set(a.login, a);
    }
    return [...map.values()].sort((x, y) => x.login.localeCompare(y.login));
  }, [columnAssignees]);

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
          {assignees.length > 0 && (
            <div className="flex items-center -space-x-1.5 shrink-0">
              {assignees.map((a) => {
                const selected = assigneeFilter === a.login;
                return (
                  <button
                    key={a.login}
                    type="button"
                    title={`@${a.login}`}
                    aria-label={`@${a.login}`}
                    aria-pressed={selected}
                    onClick={() =>
                      setAssigneeFilter((cur) => (cur === a.login ? null : a.login))
                    }
                    className={cn(
                      "size-6 rounded-full border-2 overflow-hidden bg-muted flex items-center justify-center shrink-0 cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary ring-2 ring-primary/40 z-10"
                        : "border-background",
                      assigneeFilter && !selected && "opacity-40 hover:opacity-100",
                    )}
                  >
                    {a.avatarUrl ? (
                      <img src={a.avatarUrl} alt={a.login} className="size-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold uppercase text-muted-foreground leading-none">
                        {a.login[0]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={() => setChatOpen(true)}
            title={t("board.chat.title")}
          >
            <MessageSquare />
          </Button>
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
      <Board
        board={board}
        refreshSignal={refreshSignal}
        assigneeFilter={assigneeFilter}
        onColumnAssignees={reportColumnAssignees}
      />

      {chatOpen && (
        <BoardChatModal board={board} onClose={() => setChatOpen(false)} />
      )}
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
