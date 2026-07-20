"use client";

import { useCallback, useEffect, useState } from "react";
import { Cable, LayoutGrid, GitBranch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IntegrationCard } from "@/components/connections/ConnectionCard.jsx";
import * as sourcesApi from "@/lib/api/sources.js";
import * as reposApi from "@/lib/api/repos.js";
import { readCache, writeCache, CACHE_KEYS } from "@/lib/swrCache";
import { useI18n } from "@/lib/i18nContext";

// Nome de exibição a partir do id do provider ("github-board" → "Github board").
// Cosmético — não discrimina lógica por provider (ver docs/providers.md).
function prettyName(id) {
  return String(id)
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Tela "/connections": integrações que alimentam o app — Fontes de cards
 * (Source) e Repositórios de código (Repo). Só exibe status + comandos de
 * conexão (reportados pelo backend); a auth em si é feita fora do app (gh CLI /
 * GH_TOKEN). É daqui que as integrações passam a estar disponíveis ao criar um
 * board e ao configurar a branch/worktree.
 */
export default function ConnectionsView() {
  const { t } = useI18n();
  const [sources, setSources] = useState(null); // null = carregando
  const [repos, setRepos]     = useState(null);
  const [error, setError]     = useState(false);
  const [loading, setLoading] = useState(false);

  // Revalida (refresh:true) e persiste o snapshot. Em erro, mantém o que já
  // estava (stale) em vez de zerar a tela.
  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      sourcesApi.status({ refresh: true }).catch(() => ({ error: true })),
      reposApi.hosts({ refresh: true }).catch(() => ({ error: true })),
    ])
      .then(([s, r]) => {
        if (s?.error || r?.error) setError(true);
        if (Array.isArray(s)) { setSources(s); writeCache(CACHE_KEYS.sources, s); }
        else setSources((prev) => prev ?? []);
        if (Array.isArray(r)) { setRepos(r); writeCache(CACHE_KEYS.hosts, r); }
        else setRepos((prev) => prev ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  // Hidrata do cache (stale) antes de revalidar — evita o skeleton quando já há
  // um snapshot de sessão anterior.
  useEffect(() => {
    const cs = readCache(CACHE_KEYS.sources);
    const ch = readCache(CACHE_KEYS.hosts);
    if (Array.isArray(cs)) setSources(cs);
    if (Array.isArray(ch)) setRepos(ch);
    load();
  }, [load]);

  const initialLoading = sources === null || repos === null;

  return (
    <div className="flex flex-1 flex-col min-h-0 p-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <Cable className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("connections.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("connections.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0"
        >
          <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          {t("connections.refresh")}
        </Button>
      </div>

      {initialLoading ? (
        <div className="flex flex-col gap-3 w-full max-w-xl">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : (
        <div className="flex flex-col gap-6 w-full max-w-xl">
          {error && (
            <p className="text-sm text-destructive">{t("connections.loadError")}</p>
          )}

          {/* Fontes de cards */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{t("connections.sources")}</h2>
            </div>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("connections.empty")}</p>
            ) : (
              sources.map((s) => (
                <IntegrationCard
                  key={s.source}
                  name={prettyName(s.source)}
                  logo={<LayoutGrid className="size-5" />}
                  loading={false}
                  data={s.status}
                />
              ))
            )}
          </section>

          {/* Repositórios de código */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{t("connections.repos")}</h2>
            </div>
            {repos.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("connections.empty")}</p>
            ) : (
              repos.map((r) => (
                <IntegrationCard
                  key={r.host}
                  name={prettyName(r.host)}
                  logo={<GitBranch className="size-5" />}
                  loading={false}
                  data={r.status}
                />
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
