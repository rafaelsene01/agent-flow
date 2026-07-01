"use client";

import { Bot, Sparkles, Settings, Sun, Moon, Plus, X } from "lucide-react";
import { boardSlug } from "@/lib/boardSlug.js";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18nContext";
import { FlowerMark } from "@/components/ui/flower-mark";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import UsageBadge from "@/components/UsageBadge.jsx";
import CardStateLegend from "@/components/board/CardStateLegend.jsx";
import SidebarBoardItem from "@/components/sidebar/SidebarBoardItem.jsx";

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SidebarContent({
  boards, activePath, onSelectBoard, onNavigate,
  onInitBoard, onRemoveBoard,
  onSettings, theme, onToggleTheme,
}) {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col">
      {/* Marca (leva à home) */}
      <button
        type="button"
        onClick={() => onNavigate("/")}
        className="flex items-center gap-1.5 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <FlowerMark className="size-4 shrink-0" />
        <h1 className="text-base font-semibold leading-none">Agent Flow</h1>
      </button>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto px-2">
        {/* Workspace */}
        <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          {t("sidebar.workspace")}
        </p>
        <div className="flex flex-col gap-0.5">
          <NavItem
            icon={Bot}
            label={t("sidebar.agents")}
            active={activePath === "/agent"}
            onClick={() => onNavigate("/agent")}
          />
          <NavItem
            icon={Sparkles}
            label={t("sidebar.skill")}
            active={activePath === "/skill"}
            onClick={() => onNavigate("/skill")}
          />
        </div>

        {/* Boards */}
        <div className="flex items-center justify-between px-2.5 pb-1 pt-4">
          <button
            type="button"
            onClick={() => onNavigate("/board")}
            className={cn(
              "text-[11px] font-medium uppercase tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-colors",
              activePath === "/board"
                ? "text-foreground"
                : "text-muted-foreground/70 hover:text-foreground"
            )}
          >
            {t("sidebar.boards")}
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onInitBoard}
                aria-label={t("board.init")}
                className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t("board.init")}</TooltipContent>
          </Tooltip>
        </div>
        {boards.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {boards.map((b) => (
              <SidebarBoardItem
                key={`${b.id}-${b.viewId ?? "no-view"}`}
                board={b}
                isActive={activePath === `/board/${boardSlug(b)}`}
                onSelect={onSelectBoard}
                onRemove={onRemoveBoard}
              />
            ))}
          </ul>
        ) : (
          <p className="px-2.5 py-1 text-xs text-muted-foreground/70">{t("board.none")}</p>
        )}
      </nav>

      {/* Rodapé */}
      <div className="flex items-center gap-1 border-t px-2 py-2">
        <UsageBadge />
        <div className="flex-1" />
        <CardStateLegend />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" type="button" onClick={onSettings} aria-label={t("sidebar.settings")}>
              <Settings size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{t("sidebar.settings")}</TooltipContent>
        </Tooltip>
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
          <TooltipContent side="top">
            {theme === "dark" ? t("header.theme.to-light") : t("header.theme.to-dark")}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export default function Sidebar({ open = false, onClose, ...content }) {
  const { t } = useI18n();
  return (
    <TooltipProvider>
      {/* Desktop: coluna fixa */}
      <aside className="hidden w-60 shrink-0 border-r bg-card/40 lg:block">
        <SidebarContent {...content} />
      </aside>

      {/* Mobile: drawer sobreposto */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r bg-background shadow-xl">
            <button
              type="button"
              onClick={onClose}
              aria-label={t("sidebar.menu.close")}
              className="absolute right-2 top-2.5 z-10 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={16} />
            </button>
            <SidebarContent {...content} />
          </aside>
        </div>
      )}
    </TooltipProvider>
  );
}
