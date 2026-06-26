"use client";

import { Sun, Moon, Settings, Plus, X } from "lucide-react";
import { boardSlug } from "@/lib/boardSlug.js";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import UsageBadge from "@/components/UsageBadge.jsx";
import { useI18n } from "@/lib/i18nContext";
import CardStateLegend from "@/components/board/CardStateLegend.jsx";

export default function Header({ onSettings, onInitBoard, boards = [], activePath = "", onSelectBoard, onRemoveBoard, theme = "dark", onToggleTheme }) {
  const { t } = useI18n();
  return (
    <TooltipProvider>
      <header className="sticky top-0 z-50 flex items-center gap-2 border-b glass px-3 py-1.5">
        {/* Logo + title */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span aria-label="logo" className="text-base leading-none select-none">🌸</span>
          <h1 className="text-base font-semibold leading-none">Agent Flow</h1>
        </div>

        {/* Board tabs */}
        {boards.length > 0 && (
          <nav className="flex items-end gap-0.5 overflow-x-auto flex-1 min-w-0">
            {boards.map((b) => {
              const isActive = boardSlug(b) === activePath.slice(1);
              return (
                <div
                  key={`${b.id}-${b.viewId ?? "no-view"}`}
                  className="group relative flex items-center rounded-t-md shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => onSelectBoard(b)}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors outline-none",
                      "focus-visible:ring-2 focus-visible:ring-ring/50",
                      isActive
                        ? "border-b-2 border-primary text-foreground bg-background"
                        : "border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {b.viewName ? `${b.name} - ${b.viewName}` : b.name}
                  </button>
                  <button
                    type="button"
                    title={t("header.remove.board")}
                    onClick={() => onRemoveBoard(b)}
                    className={cn(
                      "inline-flex items-center justify-center rounded-sm p-0.5 mr-1 transition-opacity outline-none",
                      "hover:bg-muted-foreground/20 focus-visible:ring-1 focus-visible:ring-ring",
                      isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
                    )}
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              );
            })}
          </nav>
        )}

        {/* Spacer when no boards */}
        {boards.length === 0 && <div className="flex-1" />}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <UsageBadge />

          {/* Add board */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-7 text-primary"
                type="button"
                onClick={onInitBoard}
                aria-label={t("board.init")}
              >
                <Plus size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("board.init")}</TooltipContent>
          </Tooltip>

          <CardStateLegend />

          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                type="button"
                onClick={onToggleTheme}
                aria-label={theme === "dark" ? t("header.theme.to-light") : t("header.theme.to-dark")}
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {theme === "dark" ? t("header.theme.to-light") : t("header.theme.to-dark")}
            </TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                type="button"
                onClick={onSettings}
                aria-label={t("header.settings")}
              >
                <Settings size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("header.settings")}</TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
}
