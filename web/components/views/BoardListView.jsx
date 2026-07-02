"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Plus } from "lucide-react";
import { boardSlug } from "@/lib/boardSlug.js";
import { columnAccent } from "@/lib/columnColors.js";
import { FlowerMark } from "@/components/ui/flower-mark";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18nContext";

// Limite de cards buscados por coluna (espelha o cap do backend). Ao bater o
// limite mostramos "19+" em vez do número, sinalizando que há mais.
const COLUMN_COUNT_CAP = 20;

function formatCount(n) {
  return n >= COLUMN_COUNT_CAP ? `${COLUMN_COUNT_CAP - 1}+` : String(n);
}

// Contagem de cards por coluna do board, servida do cache do backend. Cada seção
// mostra a cor da coluna, seu nome e, abaixo, a contagem.
function BoardColumns({ board }) {
  const columns = board.columns ?? [];
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    if (columns.length === 0) return;
    let alive = true;
    const qs = board.viewFilter
      ? `?viewFilter=${encodeURIComponent(board.viewFilter)}`
      : "";
    fetch(`/api/github/boards/${encodeURIComponent(board.id)}/column-counts${qs}`)
      .then((r) => r.json())
      .then((data) => { if (alive && !data.error) setCounts(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [board.id, board.viewFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (columns.length === 0) return null;

  function countFor(col) {
    if (!counts) return null;
    const byId = col.id != null ? counts.byId?.[col.id] : undefined;
    const byName = counts.byName?.[col.name?.toLowerCase()];
    return byId ?? byName ?? 0;
  }

  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {columns.map((col) => {
        const accent = columnAccent(col.color);
        const n = countFor(col);
        return (
          <div
            key={col.id ?? col.name}
            className="flex min-w-14 flex-col items-center gap-0.5 rounded-md border px-2.5 py-1.5"
            style={{ background: `${accent}12`, borderColor: `${accent}33` }}
          >
            <span className="max-w-24 truncate text-[11px] font-medium" style={{ color: accent }}>
              {col.name}
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: accent }}>
              {n == null ? "…" : formatCount(n)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Índice de boards (rota "/board"). Lista os boards existentes ou, quando não há
 * nenhum, mostra apenas o botão centralizado para criar o primeiro.
 */
export default function BoardListView({ boards, onSelectBoard, onInitBoard }) {
  const { t } = useI18n();

  if (boards.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <FlowerMark className="size-12" />
          <h2 className="text-base font-semibold">{t("board.none")}</h2>
          <p className="text-sm text-muted-foreground">{t("board.none.desc")}</p>
          <Button type="button" onClick={onInitBoard}>
            <Plus />
            {t("board.init")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <div className="w-full">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{t("board.list.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("board.list.desc")}</p>
          </div>
          <Button type="button" onClick={onInitBoard}>
            <Plus />
            {t("board.init")}
          </Button>
        </div>

        <ul className="flex flex-col gap-2">
          {boards.map((b) => (
            <li key={`${b.id}-${b.viewId ?? "no-view"}`}>
              <button
                type="button"
                onClick={() => onSelectBoard(b)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-card/40 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card">
                  <LayoutGrid className="size-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{boardSlug(b)}</p>
                </div>
                <BoardColumns board={b} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
