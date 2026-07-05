"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18nContext";
import { useToast } from "@/lib/toast";

// Exibe só o início e o fim do valor salvo (ex.: "1234••••••••WXYZ").
function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

// Campo de segredo: mostra o valor salvo mascarado; ao focar, limpa para o
// usuário colar um novo (visível em texto plano). Sair sem digitar volta ao
// mascarado — o valor salvo nunca é exibido em claro.
function SecretInput({ id, saved, edit, onEdit, placeholder }) {
  return (
    <Input
      id={id}
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      value={edit ?? maskSecret(saved)}
      onFocus={() => { if (edit === null) onEdit(""); }}
      onBlur={() => { if (edit === "") onEdit(null); }}
      onChange={(e) => onEdit(e.target.value)}
    />
  );
}

/**
 * Modal de configuração do Telegram. Segredos (bot token / chat id) só saem
 * daqui para o config quando o usuário cola um novo valor — campo intocado
 * mantém o que já está salvo. `integrations` é o objeto completo do config,
 * preservado no POST para não clobberar outras integrações futuras.
 */
export default function TelegramConfigModal({ telegram, integrations, onSaved, onClose }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState({
    enabled: !!telegram.enabled,
    notifyOnError: !!telegram.notifyOnError,
    notifyOnAllDone: !!telegram.notifyOnAllDone,
    notifyOnWaitingInput: !!telegram.notifyOnWaitingInput,
  });
  // null = sem edição (campo mostra o valor salvo mascarado); string = digitando.
  const [tokenEdit, setTokenEdit] = useState(null);
  const [chatIdEdit, setChatIdEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Verifica o bot no backend: detecta o chat id via getUpdates, confirma no
  // Telegram do usuário e preenche o campo aqui no modal.
  const verify = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/integrations/telegram/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: tokenEdit || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      setChatIdEdit(data.chatId);
      toast({ title: t("integrations.telegram.verifyOk") });
    } catch (err) {
      const key =
        err?.code === "no-updates" ? "integrations.telegram.verifyNoUpdates"
        : err?.code === "invalid-token" ? "integrations.telegram.verifyInvalidToken"
        : "integrations.telegram.verifyError";
      toast({ title: t(key), variant: "error" });
    } finally {
      setVerifying(false);
    }
  };

  const setFlag = (key) => (v) => setForm((prev) => ({ ...prev, [key]: v === true }));

  const save = async () => {
    setSaving(true);
    const next = {
      ...form,
      // Campo intocado (ou limpo sem digitar) mantém o segredo já salvo.
      botToken: tokenEdit || telegram.botToken || "",
      chatId: chatIdEdit || telegram.chatId || "",
    };
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrations: { ...integrations, telegram: next } }),
      });
      if (!res.ok) throw new Error("save");
      toast({ title: t("integrations.saved") });
      onSaved(next);
      onClose();
    } catch {
      toast({ title: t("integrations.saveError"), variant: "error" });
      setSaving(false);
    }
  };

  const notifyOptions = [
    { key: "notifyOnError", label: t("integrations.notify.error"), desc: t("integrations.notify.errorDesc") },
    { key: "notifyOnAllDone", label: t("integrations.notify.allDone"), desc: t("integrations.notify.allDoneDesc") },
    { key: "notifyOnWaitingInput", label: t("integrations.notify.waiting"), desc: t("integrations.notify.waitingDesc") },
  ];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[480px] p-0 gap-0 max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Send className="size-4 text-sky-500" />
            <DialogTitle className="text-base leading-none">{t("integrations.telegram.configTitle")}</DialogTitle>
          </div>
          <Button variant="ghost" size="icon-sm" type="button" onClick={onClose} aria-label={t("action.close")}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Checkbox id="telegram-enabled" checked={form.enabled} onCheckedChange={setFlag("enabled")} />
            <Label htmlFor="telegram-enabled" className="cursor-pointer text-sm">
              {t("integrations.telegram.enabled")}
            </Label>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("integrations.telegram.stepsTitle")}
            </span>
            <ol className="mt-1.5 list-decimal pl-4 text-xs text-muted-foreground [&>li]:mt-0.5">
              <li>{t("integrations.telegram.step1")}</li>
              <li>{t("integrations.telegram.step2")}</li>
              <li>{t("integrations.telegram.step3")}</li>
              <li>{t("integrations.telegram.step4")}</li>
            </ol>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telegram-bot-token">{t("integrations.telegram.botToken")}</Label>
            <SecretInput
              id="telegram-bot-token"
              saved={telegram.botToken}
              edit={tokenEdit}
              onEdit={setTokenEdit}
              placeholder="123456789:ABC-DEF…"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            type="button"
            className="self-start"
            disabled={verifying || (!tokenEdit && !telegram.botToken)}
            onClick={verify}
          >
            {verifying ? t("integrations.telegram.verifying") : t("integrations.telegram.verify")}
          </Button>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telegram-chat-id">{t("integrations.telegram.chatId")}</Label>
            <SecretInput
              id="telegram-chat-id"
              saved={telegram.chatId}
              edit={chatIdEdit}
              onEdit={setChatIdEdit}
              placeholder="-1001234567890"
            />
            <p className="text-xs text-muted-foreground">{t("integrations.telegram.secretHint")}</p>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("integrations.notify.title")}
            </span>
            {notifyOptions.map((opt) => (
              <div key={opt.key} className="flex items-start gap-2">
                <Checkbox
                  id={`telegram-${opt.key}`}
                  className="mt-0.5"
                  checked={form[opt.key]}
                  onCheckedChange={setFlag(opt.key)}
                />
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor={`telegram-${opt.key}`} className="cursor-pointer text-sm leading-none">
                    {opt.label}
                  </Label>
                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex items-center justify-end gap-2 shrink-0">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button size="sm" type="button" disabled={saving} onClick={save}>
            {saving ? t("integrations.saving") : t("integrations.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
