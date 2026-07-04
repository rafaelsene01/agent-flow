"use client";

import { useEffect, useState } from "react";
import { Plug, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18nContext";
import { useToast } from "@/lib/toast";

const TELEGRAM_DEFAULTS = { enabled: false, botToken: "", chatId: "" };

// Exibe só o início e o fim do token salvo (ex.: "1234••••••••WXYZ").
function maskToken(token) {
  if (!token) return "";
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

/**
 * Tela "/integrations": configura integrações com serviços externos,
 * persistidas em config.json → integrations. Por ora apenas o Telegram
 * (somente a configuração — o envio de mensagens ainda não existe).
 */
export default function IntegrationsView() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [telegram, setTelegram] = useState(null); // null = carregando
  // null = sem edição (campo mostra o token salvo mascarado); string = valor em digitação.
  const [tokenInput, setTokenInput] = useState(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => { if (!r.ok) throw new Error("load"); return r.json(); })
      .then((cfg) => setTelegram({ ...TELEGRAM_DEFAULTS, ...cfg.integrations?.telegram }))
      .catch(() => { setError(true); setTelegram(TELEGRAM_DEFAULTS); });
  }, []);

  const save = async () => {
    setSaving(true);
    // Campo intocado (ou limpo sem digitar) mantém o token já salvo.
    const next = { ...telegram, botToken: tokenInput || telegram.botToken };
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrations: { telegram: next } }),
      });
      if (!res.ok) throw new Error("save");
      setTelegram(next);
      setTokenInput(null);
      toast({ title: t("integrations.saved") });
    } catch {
      toast({ title: t("integrations.saveError"), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

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

      {telegram === null ? (
        <Skeleton className="h-64 w-full max-w-xl rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{t("integrations.loadError")}</p>
      ) : (
        <div className="w-full max-w-xl rounded-xl border bg-card/50 p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/15">
              <Send className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium">Telegram</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("integrations.telegram.desc")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Checkbox
                id="telegram-enabled"
                checked={telegram.enabled}
                onCheckedChange={(v) => setTelegram((prev) => ({ ...prev, enabled: v === true }))}
              />
              <Label htmlFor="telegram-enabled" className="cursor-pointer text-xs text-muted-foreground">
                {t("integrations.telegram.enabled")}
              </Label>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="telegram-bot-token">{t("integrations.telegram.botToken")}</Label>
              <Input
                id="telegram-bot-token"
                type={tokenInput === null ? "text" : "password"}
                autoComplete="off"
                placeholder="123456789:ABC-DEF…"
                value={tokenInput ?? maskToken(telegram.botToken)}
                onFocus={() => { if (tokenInput === null) setTokenInput(""); }}
                onBlur={() => { if (tokenInput === "") setTokenInput(null); }}
                onChange={(e) => setTokenInput(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="telegram-chat-id">{t("integrations.telegram.chatId")}</Label>
              <Input
                id="telegram-chat-id"
                autoComplete="off"
                placeholder="-1001234567890"
                value={telegram.chatId}
                onChange={(e) => setTelegram((prev) => ({ ...prev, chatId: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button size="sm" type="button" disabled={saving} onClick={save}>
              {saving ? t("integrations.saving") : t("integrations.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
