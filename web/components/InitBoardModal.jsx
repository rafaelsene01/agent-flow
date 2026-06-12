"use client";

import { useRef, useState, useEffect } from "react";
import { Copy, Check, GripVertical, X } from "lucide-react";
import { boardSlug } from "@/lib/boardSlug.js";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function colKey(c) {
  return c.id ?? c.name;
}

export default function InitBoardModal({ onClose, onSaved }) {
  const [boards, setBoards]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [fetchError, setFetchError]       = useState(null);
  const [missingScope, setMissingScope]   = useState(false);
  const [selected, setSelected]           = useState(null);
  const [originRepo, setOriginRepo]       = useState("");
  const [boardName, setBoardName]         = useState("");
  const [views, setViews]                 = useState([]);
  const [viewsLoading, setViewsLoading]   = useState(false);
  const [selectedView, setSelectedView]   = useState(null);
  const [allCols, setAllCols]             = useState([]);
  const [activeCols, setActiveCols]       = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [dragOver, setDragOver]           = useState(null);
  const [saving, setSaving]               = useState(false);
  const [copied, setCopied]               = useState(false);
  const dragIdx = useRef(null);

  useEffect(() => {
    fetch("/api/github/boards")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          if (data.error.includes("MISSING_SCOPE:read:project")) {
            setMissingScope(true);
          } else {
            setFetchError(data.error);
          }
          setLoading(false);
          return;
        }
        setBoards(data);
        setLoading(false);
      })
      .catch((err) => { setFetchError(err.message); setLoading(false); });
  }, []);

  function repoOptions(boardData, view) {
    const fromRepos  = (boardData?.repos ?? []).map((r) => r.fullName);
    const fromFilter = (view?.repo ?? "").split(",").map((r) => r.trim()).filter(Boolean);
    return [...new Set([...fromRepos, ...fromFilter])];
  }

  function selectBoard(board) {
    setSelected(board);
    setBoardName(board.title);
    setViews([]);
    setSelectedView(null);
    setAllCols([]);
    setActiveCols([]);
    const opts = repoOptions(board, null);
    setOriginRepo(opts.length === 1 ? opts[0] : "");
    setViewsLoading(true);
    fetch(`/api/github/boards/${encodeURIComponent(board.id)}/views`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setViews(data);
          if (data.length === 1) selectView(board, data[0]);
        }
      })
      .finally(() => setViewsLoading(false));
  }

  function selectView(board, view) {
    setSelectedView(view);
    setAllCols([]);
    setActiveCols([]);
    // Atualiza opções de repo ao selecionar uma view (o filtro pode trazer novos repos)
    setOriginRepo((prev) => {
      const opts = repoOptions(board, view);
      if (prev && opts.includes(prev)) return prev; // mantém seleção válida
      return opts.length === 1 ? opts[0] : "";
    });
    setColumnsLoading(true);
    fetch(`/api/github/boards/${encodeURIComponent(board.id)}/columns`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setAllCols(data);
          setActiveCols(data);
        }
      })
      .finally(() => setColumnsLoading(false));
  }

  // ── drag-and-drop ────────────────────────────────────────────────────────────

  function onDragStart(i) { dragIdx.current = i; }
  function onDragEnter(i) { setDragOver(i); }

  function onDrop(i) {
    const from = dragIdx.current;
    if (from === null || from === i) { resetDrag(); return; }
    const next = [...activeCols];
    const [item] = next.splice(from, 1);
    next.splice(i, 0, item);
    setActiveCols(next);
    resetDrag();
  }

  function resetDrag() {
    dragIdx.current = null;
    setDragOver(null);
  }

  function remove(col) {
    setActiveCols((prev) => prev.filter((c) => colKey(c) !== colKey(col)));
  }

  function add(col) {
    setActiveCols((prev) => [...prev, col]);
  }

  function copyScope() {
    navigator.clipboard?.writeText("gh auth refresh -s read:project");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const available = allCols.filter((apiCol) =>
    !activeCols.some((ac) =>
      (ac.id && ac.id === apiCol.id) || ac.name === apiCol.name
    )
  );

  // ── save ─────────────────────────────────────────────────────────────────────

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const configRes = await fetch("/api/config");
      const config    = await configRes.json();
      const existing  = config.boards ?? [];

      const name      = boardName || selected.title;
      const repoName  = selectedView?.repo ?? "";
      const newBoard = {
        id:         selected.id,
        viewId:     selectedView?.id ?? null,
        viewNumber: selectedView?.number ?? null,
        viewName:   selectedView?.name ?? null,
        name,
        slug:       boardSlug({ name, repoName }),
        boardPath:  "",
        repoName,
        originRepo: originRepo || null,
        viewFilter: selectedView?.filter ?? "",
        repoPath:   "",
        columns:    activeCols.map((c) => ({ id: c.id, name: c.name, color: c.color ?? null })),
      };

      await fetch("/api/config", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ boards: [...existing, newBoard] }),
      });

      onSaved(newBoard);
    } catch {
      setSaving(false);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[560px] p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">

        <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span aria-hidden="true" className="text-lg leading-none">⊞</span>
            Inicializar Board
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5">

          {/* ── Board GitHub ── */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Board GitHub
            </Label>

            {loading && (
              <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                Carregando boards…
              </div>
            )}

            {fetchError && (
              <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-destructive">
                {fetchError}
              </div>
            )}

            {missingScope && (
              <div className="border border-destructive/40 bg-destructive/10 rounded-lg p-3.5 flex flex-col gap-2.5">
                <p className="text-sm text-muted-foreground">
                  O token do{" "}
                  <code className="font-mono text-destructive bg-destructive/10 px-1 rounded">gh</code>{" "}
                  não tem o escopo{" "}
                  <code className="font-mono text-destructive bg-destructive/10 px-1 rounded">read:project</code>.
                  Execute o comando abaixo e reinicie o servidor:
                </p>
                <div className="bg-background border rounded-lg px-3 py-2 flex items-center gap-2">
                  <code className="flex-1 font-mono text-xs text-primary">
                    gh auth refresh -s read:project
                  </code>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    type="button"
                    onClick={copyScope}
                    aria-label="Copiar comando"
                  >
                    {copied ? <Check /> : <Copy />}
                  </Button>
                </div>
              </div>
            )}

            {!loading && !fetchError && !missingScope && boards.length === 0 && (
              <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                Nenhum board encontrado no GitHub Projects.
              </div>
            )}

            {!loading && boards.length > 0 && (
              <div className="border rounded-lg bg-muted/40 p-1 max-h-64 overflow-y-auto flex flex-col gap-1">
                {boards.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => selectBoard(b)}
                    className={cn(
                      "flex items-center justify-between gap-2.5 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-background hover:text-foreground transition",
                      selected?.id === b.id && "bg-background text-foreground ring-1 ring-primary"
                    )}
                  >
                    <span className="text-sm font-medium flex-1">{b.title}</span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">#{b.number}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <>
              {/* ── Nome do Board ── */}
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="board-name-input"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  Nome do Board
                </Label>
                <Input
                  id="board-name-input"
                  type="text"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                />
              </div>

              {/* ── View ── */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  View
                </Label>
                {viewsLoading && (
                  <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                    Carregando views…
                  </div>
                )}
                {!viewsLoading && views.length === 0 && (
                  <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                    Nenhuma view encontrada.
                  </div>
                )}
                {!viewsLoading && views.length > 0 && (
                  <div className="border rounded-lg bg-muted/40 p-1 max-h-64 overflow-y-auto flex flex-col gap-1">
                    {views.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => selectView(selected, v)}
                        className={cn(
                          "flex items-center justify-between gap-2.5 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-background hover:text-foreground transition",
                          selectedView?.id === v.id && "bg-background text-foreground ring-1 ring-primary"
                        )}
                      >
                        <span className="text-sm font-medium flex-1">{v.name}</span>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {v.repo ?? <span className="italic">sem repo</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Repositório de Origem ── */}
              {selectedView && (() => {
                const opts = repoOptions(selected, selectedView);
                return (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Repositório de Origem
                    </Label>
                    {opts.length === 0 ? (
                      <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                        Nenhum repositório detectado no filtro desta view.
                      </div>
                    ) : (
                      <select
                        className={cn(
                          "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
                          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          "dark:bg-input/30"
                        )}
                        value={originRepo}
                        onChange={(e) => setOriginRepo(e.target.value)}
                      >
                        <option value="">Selecione o repositório…</option>
                        {opts.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })()}

              {/* ── Colunas ativas ── */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Colunas ativas
                </span>
                {columnsLoading && (
                  <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                    Carregando colunas…
                  </div>
                )}
                {!columnsLoading && activeCols.length === 0 && (
                  <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                    Nenhuma coluna selecionada.
                  </div>
                )}
                {!columnsLoading && activeCols.length > 0 && (
                  <div className="border rounded-lg bg-muted/40 p-1 flex flex-col gap-0.5">
                    {activeCols.map((col, i) => (
                      <div
                        key={colKey(col)}
                        draggable
                        onDragStart={() => onDragStart(i)}
                        onDragEnter={() => onDragEnter(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDrop(i)}
                        onDragEnd={resetDrag}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition",
                          dragOver === i
                            ? "bg-accent border border-dashed border-primary/50"
                            : "hover:bg-muted/60"
                        )}
                      >
                        <GripVertical
                          size={14}
                          className="text-muted-foreground/50 cursor-grab shrink-0"
                          title="Arrastar para reordenar"
                        />
                        <span className="flex-1 text-sm">{col.name}</span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          type="button"
                          onClick={() => remove(col)}
                          title="Remover"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Colunas disponíveis ── */}
              {!columnsLoading && available.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Disponíveis
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {available.map((col) => (
                      <button
                        key={colKey(col)}
                        type="button"
                        onClick={() => add(col)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-muted-foreground",
                          "hover:bg-accent hover:text-accent-foreground hover:border-border transition"
                        )}
                      >
                        <span className="font-bold leading-none" aria-hidden="true">+</span>
                        {col.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-4 border-t shrink-0 sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!selected || !boardName || !selectedView || saving || columnsLoading || activeCols.length === 0}
            onClick={save}
          >
            {saving ? "Salvando…" : "Adicionar Board"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
