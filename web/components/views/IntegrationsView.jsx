"use client";

import { useEffect, useState } from "react";
import { Plug, Send, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import TelegramConfigModal from "@/components/integrations/TelegramConfigModal";
import { useI18n } from "@/lib/i18nContext";

const TELEGRAM_DEFAULTS = {
  enabled: false,
  botToken: "",
  chatId: "",
  notifyOnError: false,
  notifyOnAllDone: false,
  notifyOnWaitingInput: false,
};

/**
 * Tela "/integrations": lista as integrações com serviços externos, persistidas
 * em config.json → integrations. A listagem nunca exibe segredos (bot token /
 * chat id) — eles vivem só no modal de configuração, mascarados.
 */
export default function IntegrationsView() {
  const { t } = useI18n();
  const [integrations, setIntegrations] = useState(null); // null = carregando
  const [error, setError] = useState(false);
  const [configuring, setConfiguring] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => { if (!r.ok) throw new Error("load"); return r.json(); })
      .then((cfg) => setIntegrations(cfg.integrations ?? {}))
      .catch(() => { setError(true); setIntegrations({}); });
  }, []);

  const telegram = { ...TELEGRAM_DEFAULTS, ...integrations?.telegram };
  const notifyTags = [
    telegram.notifyOnError && t("integrations.notify.error"),
    telegram.notifyOnAllDone && t("integrations.notify.allDone"),
    telegram.notifyOnWaitingInput && t("integrations.notify.waiting"),
  ].filter(Boolean);

  return (
    <div className="flex flex-1 flex-col min-h-0 p-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <Plug className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{t("integrations.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("integrations.subtitle")}</p>
        </div>
      </div>

      {integrations === null ? (
        <Skeleton className="h-28 w-full max-w-xl rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{t("integrations.loadError")}</p>
      ) : (
        <div className="w-full max-w-xl rounded-xl border bg-card/50 p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/15">
              <Send className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">Telegram</h2>
                <Badge variant={telegram.enabled ? "default" : "secondary"}>
                  {telegram.enabled ? t("integrations.enabled") : t("integrations.disabled")}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("integrations.telegram.desc")}</p>
              {notifyTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {notifyTags.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" type="button" className="shrink-0" onClick={() => setConfiguring(true)}>
              <Settings2 className="size-3.5" />
              {t("integrations.configure")}
            </Button>
          </div>
        </div>
      )}

      {configuring && (
        <TelegramConfigModal
          telegram={telegram}
          integrations={integrations ?? {}}
          onSaved={(next) => setIntegrations((prev) => ({ ...prev, telegram: next }))}
          onClose={() => setConfiguring(false)}
        />
      )}
    </div>
  );
}
