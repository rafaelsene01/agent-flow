"use client";

import { Sun, Moon, Settings, Plus, X } from "lucide-react";
import { boardSlug } from "@/lib/boardSlug.js";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function Header({ onSettings, onInitBoard, boards = [], activePath = "", onSelectBoard, onRemoveBoard, theme = "dark", onToggleTheme }) {
  return (
    <TooltipProvider>
      <header className="sticky top-0 z-50 flex items-center gap-2 border-b bg-card px-3 py-1.5">
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
                <button
                  key={b.viewId ?? b.id}
                  type="button"
                  onClick={() => onSelectBoard(b)}
                  className={cn(
                    "group relative flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-t-md whitespace-nowrap transition-colors outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring/50",
                    isActive
                      ? "border-b-2 border-primary text-foreground bg-background"
                      : "border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <span className="truncate max-w-[120px]">
                    {b.repoName ? b.repoName.split("/").pop() : b.name}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-sm p-0.5 transition-opacity",
                      "hover:bg-muted-foreground/20",
                      isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
                    )}
                    role="button"
                    title="Remover board"
                    onClick={(e) => { e.stopPropagation(); onRemoveBoard(b); }}
                  >
                    <X size={12} strokeWidth={2} />
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Spacer when no boards */}
        {boards.length === 0 && <div className="flex-1" />}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Add board */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-7 text-primary"
                type="button"
                onClick={onInitBoard}
                aria-label="Inicializar Board"
              >
                <Plus size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Inicializar Board</TooltipContent>
          </Tooltip>

          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                type="button"
                onClick={onToggleTheme}
                aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
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
                aria-label="Configurações"
              >
                <Settings size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Configurações</TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
}
