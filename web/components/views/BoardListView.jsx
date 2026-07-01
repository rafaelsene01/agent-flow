"use client";

import { LayoutGrid, Plus } from "lucide-react";
import { boardSlug } from "@/lib/boardSlug.js";
import { FlowerMark } from "@/components/ui/flower-mark";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18nContext";

/**
 * Índice de boards (rota "/board"). Lista os boards existentes ou, quando não há
 * nenhum, mostra apenas o botão centralizado para criar o primeiro.
 */
export default function BoardListView({ boards, onSelectBoard, onInitBoard }) {
  const { t } = useI18n();

  if (boards.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <FlowerMark className="size-12" />
          <h2 className="text-base font-semibold">{t("board.none")}</h2>
          <p className="text-sm text-muted-foreground">{t("board.none.desc")}</p>
          <Button type="button" onClick={onInitBoard}>
            <Plus />
            {t("board.init")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <div className="w-full">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{t("board.list.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("board.list.desc")}</p>
          </div>
          <Button type="button" onClick={onInitBoard}>
            <Plus />
            {t("board.init")}
          </Button>
        </div>

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {boards.map((b) => (
            <li key={`${b.id}-${b.viewId ?? "no-view"}`}>
              <button
                type="button"
                onClick={() => onSelectBoard(b)}
                className="flex w-full items-center gap-3 rounded-lg border bg-card/40 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card">
                  <LayoutGrid className="size-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{boardSlug(b)}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
