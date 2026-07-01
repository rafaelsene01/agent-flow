"use client";

import { usePathname } from "next/navigation";
import { boardFromPath } from "@/lib/boardSlug.js";
import { useApp } from "@/lib/appContext";
import BoardView from "@/components/views/BoardView.jsx";
import { Button } from "@/components/ui/button";
import { FlowerMark } from "@/components/ui/flower-mark";
import { LayoutGrid } from "lucide-react";
import { useI18n } from "@/lib/i18nContext";

export default function BoardRoute() {
  const pathname = usePathname();
  const { t } = useI18n();
  const app = useApp();
  const board = boardFromPath(app.boards, pathname);

  if (!board) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <FlowerMark className="size-12" />
          <h2 className="text-base font-semibold">{t("board.notFound")}</h2>
          <p className="text-sm text-muted-foreground">{t("board.notFound.desc")}</p>
          <Button type="button" onClick={() => app.goTo("/board")}>
            <LayoutGrid />
            {t("home.cta")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <BoardView
      board={board}
      onBoardUpdated={app.handleBoardUpdated}
      onCleanup={app.cleanupBoardData}
      refreshSignal={app.worktreeRefresh}
    />
  );
}
