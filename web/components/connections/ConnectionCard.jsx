"use client";

import { useState } from "react";
import { Copy, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";

/* ── CopyButton ─────────────────────────────────────────────────────────── */
export function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    copyToClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      type="button"
      title={copied ? "Copiado!" : "Copiar"}
      onClick={copy}
      className={cn(
        "shrink-0",
        copied && "text-state-completed border-state-completed"
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

/* ── CommandBlock ────────────────────────────────────────────────────────── */
export function CommandBlock({ label, cmd }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <code className="font-mono text-xs bg-background border rounded-lg px-2.5 py-1.5 truncate flex-1">
          {cmd}
        </code>
        <CopyButton text={cmd} />
      </div>
    </div>
  );
}

/* ── StatusChip ──────────────────────────────────────────────────────────── */
export function StatusChip({ loading, connected }) {
  if (loading) {
    return (
      <span className="inline-flex items-center justify-center size-6 rounded-full text-xs font-medium animate-pulse text-muted-foreground bg-muted border border-border">
        …
      </span>
    );
  }
  if (connected) {
    return (
      <span className="inline-flex items-center justify-center size-6 rounded-full text-xs font-medium bg-state-completed/15 text-state-completed border border-state-completed/40">
        <Check className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center size-6 rounded-full text-xs font-medium bg-destructive/15 text-destructive border border-destructive/40">
      <X className="size-3.5" />
    </span>
  );
}

/* ── IntegrationCard ─────────────────────────────────────────────────────── */
// Card de status de uma integração. Os comandos de conexão (quando desconectado)
// vêm de `data.commands` reportado pelo provider — mantém a UI neutra (não
// discrimina por nome de provider). Ver docs/providers.md.
export function IntegrationCard({ name, logo, loading, data, commands }) {
  const connected = !loading && !!data?.connected;
  const failed    = !loading && !data?.connected;
  // Comandos: prioriza os passados explicitamente (ex.: Claude na Settings),
  // senão usa os reportados pelo provider em data.commands.
  const cmds = commands ?? (failed ? data?.commands ?? [] : []);

  const logoStatus = loading ? "" : connected ? "ok" : "err";
  const logoClass = cn(
    "flex items-center justify-center size-9 rounded-lg border text-lg shrink-0",
    logoStatus === "ok"  && "text-state-completed bg-state-completed/10 border-state-completed/40",
    logoStatus === "err" && "text-destructive bg-destructive/10 border-destructive/40",
    logoStatus === ""    && "text-muted-foreground bg-muted border-border"
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      {/* top row */}
      <div className="flex items-start gap-3">
        <div className={logoClass}>{logo}</div>

        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-sm font-semibold leading-tight">{name}</span>

          {loading && (
            <span className="text-xs text-muted-foreground">Verificando…</span>
          )}

          {connected && (
            <>
              {data.user && (
                <span className="text-xs text-state-completed">
                  @{data.user}{data.name ? ` — ${data.name}` : ""}
                </span>
              )}
              {data.version && (
                <span className="text-xs text-state-completed">{data.version}</span>
              )}
              {!data.user && !data.version && (
                <span className="text-xs text-state-completed">Conectado</span>
              )}
              <span className="text-xs text-muted-foreground">
                {data.method === "env"        ? "via variável de ambiente" :
                 data.method === "gh-cli"     ? "via gh CLI"               :
                 data.method === "claude-cli" ? "via claude CLI"           :
                 data.method === "token"      ? "via token"                : data.method}
              </span>
            </>
          )}

          {failed && (
            <span className="text-xs text-destructive">
              {data?.error || "Não configurado"}
            </span>
          )}
        </div>

        <StatusChip loading={loading} connected={connected} />
      </div>

      {/* commands when failed */}
      {failed && cmds?.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-3">
          {cmds.map((c) => (
            <CommandBlock key={c.cmd} label={c.label} cmd={c.cmd} />
          ))}
        </div>
      )}
    </div>
  );
}
