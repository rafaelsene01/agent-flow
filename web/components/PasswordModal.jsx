"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useI18n } from "@/lib/i18nContext";
import { setToken } from "@/lib/auth";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Modal disparado quando o backend responde 401 (senha ativa e sem token válido).
// Ao autenticar, guarda o token e recarrega a página para refazer as chamadas.
export default function PasswordModal() {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [error, setError]       = useState(false);
  const [loading, setLoading]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(true);
        setLoading(false);
        return;
      }
      const { token } = await res.json();
      setToken(token);
      window.location.reload();
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-[380px]"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" />
            <DialogTitle className="text-base leading-none">{t("auth.title")}</DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground">{t("auth.desc")}</p>
          <Input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder={t("auth.placeholder")}
          />
          {error && <span className="text-xs text-destructive">{t("auth.error")}</span>}
          <Button type="submit" disabled={!password || loading}>
            {loading ? "…" : t("auth.submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
