"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/sidebar/Sidebar.jsx";
import SettingsModal from "@/components/SettingsModal.jsx";
import InitBoardModal from "@/components/InitBoardModal.jsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { FlowerMark } from "@/components/ui/flower-mark";
import { Menu } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { useI18n } from "@/lib/i18nContext";

/**
 * Casca comum a todas as rotas: sidebar, barra superior (mobile) e modais globais.
 * Fica no layout, então persiste entre navegações. As páginas de rota entram em
 * {children}.
 */
export default function AppShell({ children }) {
  const app = useApp();
  const { t } = useI18n();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const withClose = (fn) => (...args) => { setMenuOpen(false); return fn(...args); };

  if (app.initializing) {
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
    <div className="flex min-h-screen">
      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        boards={app.boards}
        activePath={pathname}
        onSelectBoard={withClose(app.selectBoard)}
        onNavigate={withClose(app.goTo)}
        onInitBoard={withClose(app.openInitBoard)}
        onRemoveBoard={app.removeBoard}
        onSettings={app.openSettings}
        theme={app.theme}
        onToggleTheme={app.toggleTheme}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Barra superior apenas no mobile (abre o drawer da sidebar) */}
        <div className="flex items-center gap-2 border-b px-3 py-1.5 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t("sidebar.menu.open")}
          >
            <Menu size={18} />
          </Button>
          <div className="flex items-center gap-1.5">
            <FlowerMark className="size-4 shrink-0" />
            <span className="text-base font-semibold leading-none">Agent Flow</span>
          </div>
        </div>

        {children}
      </div>

      {app.showSettings && <SettingsModal onClose={app.closeSettings} />}

      {app.showInitBoard && (
        <InitBoardModal onClose={app.closeInitBoard} onSaved={app.handleBoardSaved} />
      )}

      {app.removeConfirm && (
        <ConfirmDialog
          open
          targetName={app.removeConfirm.board.name}
          title={t("confirm.remove.board")}
          description={t("board.remove.confirm")}
          destructive
          onConfirm={app.confirmRemoveBoard}
          onCancel={app.cancelRemove}
        />
      )}
    </div>
  );
}
