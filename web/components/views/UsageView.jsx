"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartColumn, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18nContext";

const PERIODS = [1, 7, 30, 90];
const METRICS = ["tokens", "cost", "time", "execs"];

// Cores das séries do gráfico validadas (dataviz) contra as superfícies do tema
// nos dois modos: entrada = azul primary do tema; saída = teal com passos
// próprios por modo (não é um flip automático).
const INPUT_BAR = "bg-primary";
const OUTPUT_BAR = "bg-[oklch(0.55_0.12_180)] dark:bg-[oklch(0.65_0.12_180)]";

// ── formatadores ───────────────────────────────────────────────────────────────

function fmtTokens(n) {
  if (n == null) return "—";
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function fmtCost(v) {
  if (v == null) return "—";
  return `$${v.toFixed(v >= 1 ? 2 : 4)}`;
}

function fmtDuration(ms) {
  const s = Math.round((ms ?? 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Chave local YYYY-MM-DD (created_at é ISO UTC; o bucket do gráfico é o dia local).
function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Teto "redondo" para o eixo Y (1/2/5 × 10^k).
function niceMax(v) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

// ── gráfico de colunas diário ──────────────────────────────────────────────────

function DailyChart({ days, metric, lang, t }) {
  const [hover, setHover] = useState(null); // índice da coluna

  const valueOf = (d) =>
    metric === "tokens"
      ? d.inputTokens + d.outputTokens
      : metric === "cost"
        ? d.cost
        : metric === "time"
          ? d.durationMs
          : d.execs;

  const max = niceMax(Math.max(...days.map(valueOf)));
  const fmtY =
    metric === "tokens"
      ? fmtTokens
      : metric === "cost"
        ? fmtCost
        : metric === "time"
          ? fmtDuration
          : (v) => String(v);

  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const fmtDay = (d) =>
    d.date.toLocaleDateString(locale, { day: "numeric", month: "numeric" });
  const labelStep = Math.max(1, Math.ceil(days.length / 8));

  return (
    <div className="flex gap-2">
      {/* gutter do eixo Y */}
      <div className="flex h-40 w-12 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-muted-foreground">
        <span>{fmtY(max)}</span>
        <span>{fmtY(max / 2)}</span>
        <span>0</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative h-40">
          {/* gridlines hairline recessivas */}
          <div className="absolute inset-x-0 top-0 border-t border-border/50" />
          <div className="absolute inset-x-0 top-1/2 border-t border-border/50" />

          <div className="absolute inset-0 flex items-end border-b border-border">
            {days.map((d, i) => {
              const total = valueOf(d);
              const stacked = metric === "tokens";
              const inPct = stacked ? (d.inputTokens / max) * 100 : 0;
              const outPct = stacked ? (d.outputTokens / max) * 100 : 0;
              const pct = (total / max) * 100;
              return (
                <div
                  key={d.key}
                  className="group relative flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div className="flex h-full w-full max-w-6 flex-col items-stretch justify-end px-px">
                    {stacked ? (
                      <>
                        {d.outputTokens > 0 && (
                          <div
                            className={cn("rounded-t-[4px]", OUTPUT_BAR)}
                            style={{ height: `${outPct}%` }}
                          />
                        )}
                        {/* espaçador de 2px na cor da superfície entre segmentos */}
                        {d.outputTokens > 0 && d.inputTokens > 0 && (
                          <div className="h-0.5 shrink-0" />
                        )}
                        {d.inputTokens > 0 && (
                          <div
                            className={cn(
                              INPUT_BAR,
                              d.outputTokens === 0 && "rounded-t-[4px]",
                            )}
                            style={{ height: `${inPct}%` }}
                          />
                        )}
                      </>
                    ) : (
                      total > 0 && (
                        <div
                          className={cn("rounded-t-[4px]", INPUT_BAR)}
                          style={{ height: `${pct}%` }}
                        />
                      )
                    )}
                  </div>

                  {hover === i && (
                    <div
                      className={cn(
                        "pointer-events-none absolute bottom-full z-10 mb-1 w-max rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
                        i < 2
                          ? "left-0"
                          : i > days.length - 3
                            ? "right-0"
                            : "left-1/2 -translate-x-1/2",
                      )}
                    >
                      <p className="font-medium">
                        {d.date.toLocaleDateString(locale, {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                      {metric === "tokens" ? (
                        <>
                          <p className="mt-0.5 text-muted-foreground">
                            {t("usage.summary.input")}: {fmtTokens(d.inputTokens)}
                          </p>
                          <p className="text-muted-foreground">
                            {t("usage.summary.output")}: {fmtTokens(d.outputTokens)}
                          </p>
                          <p>
                            {t("usage.tooltip.total")}:{" "}
                            {fmtTokens(d.inputTokens + d.outputTokens)}
                          </p>
                        </>
                      ) : metric === "execs" ? (
                        <p className="mt-0.5">
                          {d.execs} {t("usage.tooltip.execs")}
                        </p>
                      ) : (
                        <p className="mt-0.5">{fmtY(total)}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* rótulos do eixo X (a cada N dias para não colidir) */}
        <div className="flex pt-1">
          {days.map((d, i) => (
            <span
              key={d.key}
              className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground"
            >
              {i % labelStep === 0 ? fmtDay(d) : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── blocos da página ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border bg-card/50 p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function RepoSelect({ value, onChange, repos, t }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="min-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value="all">{t("usage.filter.allRepos")}</SelectItem>
        {repos.map((r) => (
          <SelectItem key={r} value={r}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatsTable({ headers, rows, emptyText }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card/50 shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {headers.map((h, i) => (
              <th
                key={h}
                className={cn("px-3 py-2 font-medium", i > 0 && "text-right")}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-3 py-6 text-center text-xs text-muted-foreground"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((cells, i) => (
              <tr key={i} className="border-b last:border-b-0">
                {cells.map((c, j) => (
                  <td
                    key={j}
                    className={cn(
                      "px-3 py-2",
                      j > 0 && "whitespace-nowrap text-right tabular-nums",
                    )}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Tela "/usage": estatísticas das execuções de agentes (usage_records) —
 * resumo, gráfico diário e agregações por card e por agente. O filtro de
 * board atua sobre o repo de origem do run.
 */
export default function UsageView() {
  const { t, lang } = useI18n();
  const [records, setRecords] = useState(null); // null = carregando
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState(7);
  const [repo, setRepo] = useState("all");
  const [metric, setMetric] = useState("tokens");

  function load() {
    fetch("/api/usage-stats")
      .then((r) => {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then((d) => setRecords(d.records ?? []))
      .catch(() => {
        setError(true);
        setRecords([]);
      });
  }

  useEffect(load, []);

  function clearAll() {
    if (!window.confirm(t("usage.clearConfirm"))) return;
    setRecords([]);
    fetch("/api/usage-stats", { method: "DELETE" }).finally(load);
  }

  const repos = useMemo(
    () => [...new Set((records ?? []).map((r) => r.repo))].sort(),
    [records],
  );

  // Janela por dias de calendário: do início de (hoje - período + 1) até agora.
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (period - 1));
    return d;
  }, [period]);

  const filtered = useMemo(
    () =>
      (records ?? []).filter(
        (r) =>
          new Date(r.created_at) >= cutoff &&
          (repo === "all" || r.repo === repo),
      ),
    [records, cutoff, repo],
  );

  const summary = useMemo(() => {
    const s = {
      cost: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      execs: filtered.length,
      failed: 0,
    };
    const tasks = new Set();
    for (const r of filtered) {
      s.cost += r.cost_usd ?? 0;
      s.inputTokens += r.input_tokens ?? 0;
      s.outputTokens += r.output_tokens ?? 0;
      s.durationMs += r.duration_ms ?? 0;
      if (r.status === "error") s.failed++;
      if (r.card_number != null) tasks.add(`${r.repo}#${r.card_number}`);
    }
    s.tasks = tasks.size;
    return s;
  }, [filtered]);

  const days = useMemo(() => {
    const byKey = new Map();
    const list = [];
    for (let i = 0; i < period; i++) {
      const date = new Date(cutoff);
      date.setDate(date.getDate() + i);
      const day = {
        key: dayKey(date),
        date,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        durationMs: 0,
        execs: 0,
      };
      byKey.set(day.key, day);
      list.push(day);
    }
    for (const r of filtered) {
      const day = byKey.get(dayKey(new Date(r.created_at)));
      if (!day) continue;
      day.inputTokens += r.input_tokens ?? 0;
      day.outputTokens += r.output_tokens ?? 0;
      day.cost += r.cost_usd ?? 0;
      day.durationMs += r.duration_ms ?? 0;
      day.execs++;
    }
    return list;
  }, [filtered, cutoff, period]);

  // Tabelas: mesmos filtros de período e board do topo da página.
  const cardRows = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const key = `${r.repo}#${r.card_number ?? "—"}`;
      const g =
        map.get(key) ??
        { repo: r.repo, card: r.card_number, tokens: 0, cost: 0, durationMs: 0, agents: new Set() };
      g.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      g.cost += r.cost_usd ?? 0;
      g.durationMs += r.duration_ms ?? 0;
      g.agents.add(r.agent_name);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [filtered]);

  const agentRows = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const g =
        map.get(r.agent_name) ??
        { agent: r.agent_name, tokens: 0, cost: 0, durationMs: 0, cards: new Set() };
      g.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      g.cost += r.cost_usd ?? 0;
      g.durationMs += r.duration_ms ?? 0;
      if (r.card_number != null) g.cards.add(`${r.repo}#${r.card_number}`);
      map.set(r.agent_name, g);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [filtered]);

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-y-auto p-6">
      {/* cabeçalho */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <ChartColumn className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("usage.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("usage.subtitle")}</p>
        </div>
        {records && records.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearAll}
            className="shrink-0 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
            {t("usage.clear")}
          </Button>
        )}
      </div>

      {records === null ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{t("usage.loadError")}</p>
      ) : records.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ChartColumn className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t("usage.empty")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <RepoSelect value={repo} onChange={setRepo} repos={repos} t={t} />
            <div className="flex rounded-md border p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-xs transition-colors",
                    period === p
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`usage.period.${p}d`)}
                </button>
              ))}
            </div>
          </div>

          {/* resumo */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label={t("usage.summary.cost")} value={fmtCost(summary.cost)} />
            <SummaryCard
              label={t("usage.summary.tokens")}
              value={fmtTokens(summary.inputTokens + summary.outputTokens)}
              sub={`${fmtTokens(summary.inputTokens)} ${t("usage.summary.input")} · ${fmtTokens(summary.outputTokens)} ${t("usage.summary.output")}`}
            />
            <SummaryCard
              label={t("usage.summary.time")}
              value={fmtDuration(summary.durationMs)}
              sub={`${summary.tasks} ${t("usage.summary.tasks")}`}
            />
            <SummaryCard
              label={t("usage.summary.execs")}
              value={summary.execs}
              sub={`${summary.failed} ${t("usage.summary.failed")}`}
            />
          </div>

          {/* gráfico diário */}
          <div className="rounded-xl border bg-card/50 p-4 shadow-card">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border p-0.5">
                {METRICS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetric(m)}
                    className={cn(
                      "rounded-sm px-2.5 py-1 text-xs transition-colors",
                      metric === m
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`usage.metric.${m}`)}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              {metric === "tokens" && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-full", INPUT_BAR)} />
                    {t("usage.summary.input")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-full", OUTPUT_BAR)} />
                    {t("usage.summary.output")}
                  </span>
                </div>
              )}
            </div>
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">
                {t("usage.emptyPeriod")}
              </p>
            ) : (
              <DailyChart days={days} metric={metric} lang={lang} t={t} />
            )}
          </div>

          {/* tabelas por card e por agente (seguem os filtros do topo) */}
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">{t("usage.table.cards.title")}</h2>
                <StatsTable
                  emptyText={t("usage.table.empty")}
                  headers={[
                    t("usage.table.card"),
                    t("usage.table.tokens"),
                    t("usage.table.cost"),
                    t("usage.table.time"),
                    t("usage.table.agents"),
                  ]}
                  rows={cardRows.map((g) => [
                    <span key="c" className="block">
                      <span className="font-medium">
                        {g.card != null ? `#${g.card}` : t("usage.table.noCard")}
                      </span>
                      <span className="block text-xs text-muted-foreground">{g.repo}</span>
                    </span>,
                    fmtTokens(g.tokens),
                    fmtCost(g.cost),
                    fmtDuration(g.durationMs),
                    <span key="a" title={[...g.agents].join(", ")}>
                      {g.agents.size}
                    </span>,
                  ])}
                />
              </div>
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">{t("usage.table.agents.title")}</h2>
                <StatsTable
                  emptyText={t("usage.table.empty")}
                  headers={[
                    t("usage.table.agent"),
                    t("usage.table.tokens"),
                    t("usage.table.cost"),
                    t("usage.table.time"),
                    t("usage.table.cards"),
                  ]}
                  rows={agentRows.map((g) => [
                    <span key="n" className="font-medium">{g.agent}</span>,
                    fmtTokens(g.tokens),
                    fmtCost(g.cost),
                    fmtDuration(g.durationMs),
                    g.cards.size,
                  ])}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
