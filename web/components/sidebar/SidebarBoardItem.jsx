"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18nContext";

/**
 * Item de board na sidebar: navegável (seleciona o board) + botão de remover
 * que aparece no hover. Editar colunas e limpar dados ficam na barra do board.
 * Somente UI — delega aos handlers existentes de page.jsx.
 */
export default function SidebarBoardItem({ board, isActive, onSelect, onRemove }) {
  const { t } = useI18n();
  const label = board.viewName ? `${board.name} - ${board.viewName}` : board.name;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center rounded-md transition-colors",
          isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(board)}
          aria-current={isActive ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-md"
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              isActive ? "bg-primary" : "bg-muted-foreground/40 group-hover:bg-muted-foreground"
            )}
          />
          <span className="truncate">{label}</span>
        </button>
        <button
          type="button"
          onClick={() => onRemove(board)}
          aria-label={t("header.remove.board")}
          title={t("header.remove.board")}
          className={cn(
            "mr-1 inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity outline-none",
            "hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-destructive/40 group-hover:opacity-100"
          )}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
