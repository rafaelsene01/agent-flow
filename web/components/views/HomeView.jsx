"use client";

import { LayoutGrid, GitBranch, Terminal } from "lucide-react";
import { FlowerMark } from "@/components/ui/flower-mark";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18nContext";

/**
 * Home (rota "/"). Não lista boards nem faz chamadas de backend — a validação
 * das integrações continua acontecendo no App (abre o SettingsModal quando
 * necessário). Aqui só apresentamos o que o projeto é e um atalho para os boards.
 */
export default function HomeView({ onGoBoards }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <FlowerMark className="size-14" />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold">Agent Flow</h1>
          <p className="text-sm text-muted-foreground">{t("home.tagline")}</p>
          <p className="text-sm text-muted-foreground">{t("home.desc")}</p>
        </div>

        <div className="w-full rounded-lg border bg-card/40 p-4 text-left">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            {t("home.prereqs")}
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex items-center gap-2">
              <GitBranch className="size-4 shrink-0 text-muted-foreground" />
              <span>{t("home.prereqs.github")}</span>
            </li>
            <li className="flex items-center gap-2">
              <Terminal className="size-4 shrink-0 text-muted-foreground" />
              <span>{t("home.prereqs.claude")}</span>
            </li>
          </ul>
        </div>

        <Button type="button" onClick={onGoBoards}>
          <LayoutGrid />
          {t("home.cta")}
        </Button>
      </div>
    </div>
  );
}
