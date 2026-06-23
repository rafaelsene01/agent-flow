"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Normaliza string legada para { id: null, name } ou mantém { id, name }.
function normalizeCol(c) {
  return typeof c === "string" ? { id: null, name: c } : c;
}

function colKey(c) {
  return c.id ?? c.name;
}

export default function EditBoardModal({ board, onClose, onSaved }) {
  const [allCols, setAllCols]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeCols, setActiveCols] = useState(
    (board.columns ?? []).map(normalizeCol)
  );
  const [saving]                    = useState(false);
  const [dragOver, setDragOver]     = useState(null);
  const [originRepo, setOriginRepo] = useState(board.originRepo ?? "");
  const [viewFilter, setViewFilter] = useState(board.viewFilter ?? "");
  const dragIdx = useRef(null);

  const repoOptions = [...new Set(
    [...(viewFilter ?? "").matchAll(/repo:([^\s]+)/gi)]
      .flatMap((m) => m[1].split(","))
      .map((r) => r.trim())
      .filter(Boolean)
  )];

  useEffect(() => {
    fetch(`/api/github/boards/${encodeURIComponent(board.id)}/columns`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          const apiCols = data.map((c) => ({ id: c.id, name: c.name }));
          setAllCols(apiCols);
          // Migra colunas salvas como string (id: null) para o formato { id, name }
          // fazendo match por nome com as opções reais da API.
          setActiveCols((prev) =>
            prev.map((ac) =>
              ac.id ? ac : (apiCols.find((c) => c.name === ac.name) ?? ac)
            )
          );
        }
      })
      .finally(() => setLoading(false));
  }, [board.id]);

  function onDragStart(i) {
    dragIdx.current = i;
  }

  function onDragEnter(i) {
    setDragOver(i);
  }

  function onDrop(i) {
    const from = dragIdx.current;
    if (from === null || from === i) { reset(); return; }
    const next = [...activeCols];
    const [item] = next.splice(from, 1);
    next.splice(i, 0, item);
    setActiveCols(next);
    reset();
  }

  function reset() {
    dragIdx.current = null;
    setDragOver(null);
  }

  function remove(col) {
    setActiveCols((prev) => prev.filter((c) => colKey(c) !== colKey(col)));
  }

  function add(col) {
    setActiveCols((prev) => [...prev, col]);
  }

  // Compara por ID quando disponível, senão por nome (compat com configs antigos).
  const available = allCols.filter((apiCol) =>
    !activeCols.some((ac) =>
      (ac.id && ac.id === apiCol.id) || ac.name === apiCol.name
    )
  );

  function save() {
    onSaved({ ...board, columns: activeCols, originRepo: originRepo || null, viewFilter: viewFilter.trim() });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-md p-0 gap-0 flex flex-col overflow-hidden"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between px-4 py-3 border-b gap-0">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground" aria-hidden="true">✎</span>
            <DialogTitle className="text-sm font-semibold leading-none">
              {board.name}
            </DialogTitle>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0"
          >
            <X className="size-3.5" />
          </Button>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-col gap-4 px-4 py-4 overflow-y-auto">

          {/* Filtro da View */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="edit-view-filter"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Filtro da View
            </label>
            <textarea
              id="edit-view-filter"
              value={viewFilter}
              onChange={(e) => setViewFilter(e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder="repo:owner/name is:open …"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none resize-y focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            />
          </div>

          {/* Repositório de Origem */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="edit-origin-repo"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Repositório de Origem
            </label>
            {repoOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum repositório detectado no filtro desta view.
              </p>
            ) : (
              <select
                id="edit-origin-repo"
                value={originRepo}
                onChange={(e) => setOriginRepo(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              >
                <option value="">Selecione o repositório…</option>
                {repoOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            )}
          </div>

          {/* Colunas ativas */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Colunas ativas
            </span>
            {activeCols.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma coluna ativa.</p>
            ) : (
              <div className="border rounded-lg bg-muted/40 p-1 flex flex-col gap-1">
                {activeCols.map((col, i) => (
                  <div
                    key={colKey(col)}
                    className={cn(
                      "flex items-center gap-2 rounded-md bg-background border px-2.5 py-2 text-sm transition",
                      dragOver === i && "border-primary bg-primary/10"
                    )}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragEnter={() => onDragEnter(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(i)}
                    onDragEnd={reset}
                  >
                    <GripVertical
                      className="size-3.5 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
                      title="Arrastar para reordenar"
                    />
                    <span className="flex-1 truncate">{col.name}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      type="button"
                      onClick={() => remove(col)}
                      title="Remover"
                      aria-label={`Remover coluna ${col.name}`}
                      className="shrink-0 hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Colunas disponíveis */}
          {!loading && available.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Disponíveis
              </span>
              <div className="border rounded-lg bg-muted/40 p-1 flex flex-col gap-1">
                {available.map((col) => (
                  <button
                    key={colKey(col)}
                    type="button"
                    onClick={() => add(col)}
                    className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-background transition"
                  >
                    <Plus className="size-3.5 text-state-completed shrink-0" />
                    {col.name}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="default"
            type="button"
            disabled={saving || activeCols.length === 0}
            onClick={save}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
