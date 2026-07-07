"use client";

import { useEffect, useState } from "react";
import { ArrowUpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18nContext";
import { useToast } from "@/lib/toast";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Versão instalada, exibida discreta ao lado da marca (GET /api/update,
// campo `current`). Quando há versão nova no remoto, o ícone aparece pulsando
// e o clique abre a confirmação — que avisa se runs do Claude ativos serão
// encerrados. Só a confirmação dispara o POST /api/update (grava a flag que o
// daemon observa); nada atualiza sozinho. Depois do aceite, a página recarrega
// automaticamente quando a API voltar na versão nova.
export default function UpdateBadge() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [info, setInfo] = useState(null);
  const [confirming, setConfirming] = useState(false);
  // Versão instalada no momento do aceite; quando setada, ativa a sondagem
  // que recarrega a página assim que a API voltar na versão nova
  const [acceptedFrom, setAcceptedFrom] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch("/api/update");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setInfo(data);
      } catch {}
    }

    load();
    const id = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Só após o usuário aceitar a atualização: sonda a API (que cai enquanto o
  // daemon reinicia) e recarrega a página quando ela voltar respondendo com
  // versão diferente da aceita. Queda da API fora desse fluxo nunca recarrega
  // nada — o daemon se restarta sozinho e o reload fica a cargo do usuário.
  useEffect(() => {
    if (!acceptedFrom) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/update", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.current && data.current !== acceptedFrom) window.location.reload();
      } catch {
        // API fora do ar durante o restart — esperado, segue sondando
      }
    }, 3_000);
    return () => clearInterval(id);
  }, [acceptedFrom]);

  if (!info?.current) return null;

  // Sem atualização: só a versão, estática e discreta
  if (!info.updateAvailable) {
    return (
      <span className="ml-auto self-center text-[10px] font-normal tabular-nums text-muted-foreground/70">
        v{info.current}
      </span>
    );
  }

  async function openConfirm() {
    // Recarrega para ter o número de runs ativos do momento do clique
    try {
      const res = await fetch("/api/update");
      if (res.ok) setInfo(await res.json());
    } catch {}
    setConfirming(true);
  }

  async function confirmUpdate() {
    setConfirming(false);
    try {
      const res = await fetch("/api/update", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("update.error"));
      setInfo(data);
      setAcceptedFrom(data.current);
      toast({ title: t("update.requested"), description: t("update.requested.desc") });
    } catch (err) {
      toast({ title: t("update.error"), description: err.message, variant: "destructive" });
    }
  }

  const description =
    t("update.confirm.desc") +
    (info.activeRuns > 0 ? ` ${t("update.confirm.kill").replace("{n}", info.activeRuns)}` : "");

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={openConfirm}
            disabled={info.updateRequested}
            className={cn(
              "ml-auto inline-flex items-center gap-1 self-center rounded-md px-1 py-0.5 text-[10px] font-normal tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              info.updateRequested
                ? "cursor-default text-muted-foreground"
                : "text-primary hover:bg-muted"
            )}
          >
            <ArrowUpCircle className={cn("size-3 shrink-0", !info.updateRequested && "animate-pulse")} />
            v{info.current}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {info.updateRequested
            ? t("update.inProgress")
            : t("update.available").replace("{v}", info.latest)}
        </TooltipContent>
      </Tooltip>
      <ConfirmDialog
        open={confirming}
        title={t("update.confirm.title").replace("{v}", info.latest)}
        description={description}
        destructive={info.activeRuns > 0}
        onConfirm={confirmUpdate}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
