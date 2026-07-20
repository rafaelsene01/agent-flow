"use client";

import { useRef, useState, useEffect } from "react";
import { useI18n } from "@/lib/i18nContext";
import { Copy, Check, GripVertical, X, LayoutGrid } from "lucide-react";
import { boardSlug } from "@/lib/boardSlug.js";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import * as sourcesApi from "@/lib/api/sources.js";
import * as reposApi from "@/lib/api/repos.js";
import { readCache, writeCache, CACHE_KEYS } from "@/lib/swrCache";
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
  const { t } = useI18n();
  const [boards, setBoards]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [fetchError, setFetchError]       = useState(null);
  const [missingScope, setMissingScope]   = useState(false);
  const [selected, setSelected]           = useState(null);
  // Integrações conectadas (tela de Conexões). Fonte de cards + host de código.
  const [sources, setSources]             = useState([]); // ids de sources conectados
  const [source, setSource]               = useState(sourcesApi.DEFAULT_SOURCE);
  const [repoHosts, setRepoHosts]         = useState([]); // ids de hosts conectados
  const [repoHost, setRepoHost]           = useState(reposApi.DEFAULT_HOST);
  // Organizações (1º passo da montagem de board em sources que agrupam por org,
  // ex.: custom-kanban). Próximos selects da cadeia derivam da org escolhida.
  const [organizations, setOrganizations]   = useState([]);
  const [organization, setOrganization]     = useState("");
  const [orgsLoading, setOrgsLoading]       = useState(false);
  // Projects da organização escolhida (2º passo da cadeia custom-kanban).
  const [projects, setProjects]             = useState([]);
  const [project, setProject]               = useState("");
  const [projectsLoading, setProjectsLoading] = useState(false);
  // Boards do project escolhido (3º passo da cadeia custom-kanban).
  const [customBoards, setCustomBoards]         = useState([]);
  const [customBoard, setCustomBoard]           = useState("");
  const [customBoardsLoading, setCustomBoardsLoading] = useState(false);
  // Repositório vinculado (custom-kanban): lista todos os repos do host com filtro.
  const [customRepos, setCustomRepos]           = useState([]);
  const [customReposLoading, setCustomReposLoading] = useState(false);
  const [repoFilter, setRepoFilter]             = useState("");
  const [originRepo, setOriginRepo]       = useState("");
  const [boardName, setBoardName]         = useState("");
  const [views, setViews]                 = useState([]);
  const [viewsLoading, setViewsLoading]   = useState(false);
  const [selectedView, setSelectedView]   = useState(null);
  const [allCols, setAllCols]             = useState([]);
  const [activeCols, setActiveCols]       = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError]     = useState(null);
  const [dragOver, setDragOver]           = useState(null);
  const [viewFilter, setViewFilter]       = useState("");
  const [saving, setSaving]               = useState(false);
  const [copied, setCopied]               = useState(false);
  const [cmdInstall, setCmdInstall]       = useState("");
  const [cmdBuild, setCmdBuild]           = useState("");
  const [cmdLint, setCmdLint]             = useState("");
  const [cmdTest, setCmdTest]             = useState("");
  const [cmdExtra, setCmdExtra]           = useState("");
  const dragIdx = useRef(null);


  // Carrega as integrações conectadas e pré-seleciona a Fonte/Host padrão.
  // Stale-while-revalidate: aplica o snapshot em cache na hora (sessão anterior)
  // e revalida (refresh:true) ao abrir o modal, persistindo o resultado.
  useEffect(() => {
    const applySources = (list) => {
      const connected = Array.isArray(list)
        ? list.filter((s) => s.status?.connected).map((s) => s.source)
        : [];
      setSources(connected);
      if (connected.length) setSource((prev) => connected.includes(prev) ? prev : connected[0]);
    };
    const applyHosts = (list) => {
      const connected = Array.isArray(list)
        ? list.filter((h) => h.status?.connected).map((h) => h.host)
        : [];
      setRepoHosts(connected);
      if (connected.length) setRepoHost((prev) => connected.includes(prev) ? prev : connected[0]);
    };

    applySources(readCache(CACHE_KEYS.sources));
    applyHosts(readCache(CACHE_KEYS.hosts));

    sourcesApi.status({ refresh: true })
      .then((list) => { applySources(list); if (Array.isArray(list)) writeCache(CACHE_KEYS.sources, list); })
      .catch(() => {});
    reposApi.hosts({ refresh: true })
      .then((list) => { applyHosts(list); if (Array.isArray(list)) writeCache(CACHE_KEYS.hosts, list); })
      .catch(() => {});
  }, []);

  // Descobre os boards da Fonte selecionada. Reexecuta ao trocar de Fonte,
  // zerando a seleção anterior.
  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    setMissingScope(false);
    setSelected(null);
    setBoards([]);
    setViews([]);
    setSelectedView(null);
    setAllCols([]);
    setActiveCols([]);
    // Custom Kanban tem cadeia própria (org → …). A descoberta estilo GitHub
    // Projects não se aplica aqui; o passo de boards vem depois da org.
    if (source === sourcesApi.CUSTOM_KANBAN_SOURCE) {
      setLoading(false);
      return;
    }
    sourcesApi.boards(source)
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
  }, [source]);

  // Carrega as organizações do Custom Kanban ao selecionar essa fonte (1º passo).
  useEffect(() => {
    setOrganizations([]);
    setOrganization("");
    if (source !== sourcesApi.CUSTOM_KANBAN_SOURCE) return;
    setOrgsLoading(true);
    sourcesApi.organizations(source)
      .then((data) => { if (Array.isArray(data)) setOrganizations(data); })
      .catch(() => {})
      .finally(() => setOrgsLoading(false));
  }, [source]);

  // Carrega os projects da organização escolhida (2º passo). Zera ao trocar de
  // org/fonte.
  useEffect(() => {
    setProjects([]);
    setProject("");
    if (source !== sourcesApi.CUSTOM_KANBAN_SOURCE || !organization) return;
    setProjectsLoading(true);
    sourcesApi.projects(source, organization)
      .then((data) => { if (Array.isArray(data)) setProjects(data); })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, [source, organization]);

  // Carrega os boards do project escolhido (3º passo). Zera ao trocar de
  // project/org/fonte.
  useEffect(() => {
    setCustomBoards([]);
    setCustomBoard("");
    if (source !== sourcesApi.CUSTOM_KANBAN_SOURCE || !organization || !project) return;
    setCustomBoardsLoading(true);
    sourcesApi.projectBoards(source, organization, project)
      .then((data) => { if (Array.isArray(data)) setCustomBoards(data); })
      .catch(() => {})
      .finally(() => setCustomBoardsLoading(false));
  }, [source, organization, project]);

  // Carrega as colunas do board custom (último passo). Dispara só APÓS escolher o
  // repositório (originRepo) — sequencia as chamadas (repos → colunas) para não
  // concorrer com o carregamento de repos e evitar timeout no serviço externo.
  // Alimenta o mesmo editor de colunas do fluxo github (allCols/activeCols).
  useEffect(() => {
    setAllCols([]);
    setActiveCols([]);
    setColumnsError(null);
    if (source !== sourcesApi.CUSTOM_KANBAN_SOURCE || !organization || !project || !customBoard || !originRepo) return;
    setColumnsLoading(true);
    sourcesApi.boardColumns(source, organization, project, customBoard)
      .then((data) => {
        if (Array.isArray(data)) { setAllCols(data); setActiveCols(data); }
        else setColumnsError(data?.error || "Resposta inesperada ao carregar colunas.");
      })
      .catch((err) => setColumnsError(err.message))
      .finally(() => setColumnsLoading(false));
  }, [source, organization, project, customBoard, originRepo]);

  // Carrega todos os repos do host selecionado (fluxo custom). No github, lista
  // todos os repos a que o usuário tem acesso; o filtro é aplicado no client.
  // Early-return antes de qualquer reset para não interferir no fluxo github
  // (que gerencia originRepo via selectBoard/selectView).
  useEffect(() => {
    if (source !== sourcesApi.CUSTOM_KANBAN_SOURCE || !customBoard) return;
    setCustomRepos([]);
    setOriginRepo("");
    setRepoFilter("");
    setCustomReposLoading(true);
    reposApi.listRepos(repoHost)
      .then((data) => { if (Array.isArray(data)) setCustomRepos(data); })
      .catch(() => {})
      .finally(() => setCustomReposLoading(false));
  }, [source, customBoard, repoHost]);

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
    sourcesApi.views(board.id)
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
    setViewFilter(view.filter ?? "");
    setAllCols([]);
    setActiveCols([]);
    // Atualiza opções de repo ao selecionar uma view (o filtro pode trazer novos repos)
    setOriginRepo((prev) => {
      const opts = repoOptions(board, view);
      if (prev && opts.includes(prev)) return prev; // mantém seleção válida
      return opts.length === 1 ? opts[0] : "";
    });
    setColumnsLoading(true);
    sourcesApi.columns(board.id)
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
    copyToClipboard("gh auth refresh -s read:project").then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const available = allCols.filter((apiCol) =>
    !activeCols.some((ac) =>
      (ac.id && ac.id === apiCol.id) || ac.name === apiCol.name
    )
  );

  // Editor de colunas (ativas + disponíveis), compartilhado entre o fluxo github
  // e o custom-kanban. A bolinha usa a cor da coluna (headerColor no custom) para
  // deixar visível a cor com que ela será renderizada no board.
  function ColorDot({ color }) {
    if (!color) return null;
    return (
      <span
        className="size-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/15"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
    );
  }

  function renderColumnsEditor() {
    return (
      <>
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
          {!columnsLoading && columnsError && (
            <div className="border border-destructive/40 bg-destructive/10 rounded-lg p-3 text-sm text-destructive">
              {columnsError}
            </div>
          )}
          {!columnsLoading && !columnsError && activeCols.length === 0 && (
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
                  <ColorDot color={col.color} />
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
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground",
                    "hover:bg-accent hover:text-accent-foreground hover:border-border transition"
                  )}
                >
                  <span className="font-bold leading-none" aria-hidden="true">+</span>
                  <ColorDot color={col.color} />
                  {col.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  // ── save ─────────────────────────────────────────────────────────────────────

  const isCustomSource = source === sourcesApi.CUSTOM_KANBAN_SOURCE;

  // Colunas escolhidas → shape persistido (id, name, color) — comum aos dois fluxos.
  function columnsPayload() {
    return activeCols.map((c) => ({ id: c.id, name: c.name, color: c.color ?? null }));
  }

  // Repo selecionado (originRepo = "owner/repo") → vínculo explícito repo↔board (REQ-6).
  function linkedReposPayload() {
    const [owner, repo] = (originRepo || "").split("/");
    return owner && repo ? [{ host: repoHost, owner, repo }] : [];
  }

  function buildGithubBoard() {
    const name = boardName || selected.title;
    const vf   = viewFilter.trim();
    return {
      id:         selected.id,
      source,
      repos:      linkedReposPayload(),
      viewId:     selectedView?.id ?? null,
      viewNumber: selectedView?.number ?? null,
      viewName:   selectedView?.name ?? null,
      name,
      slug:       boardSlug({ name, viewFilter: vf }),
      boardPath:  "",
      originRepo: originRepo || null,
      viewFilter: vf,
      repoPath:   "",
      columns:    columnsPayload(),
      validation: {
        install: cmdInstall.trim() || null,
        build:   cmdBuild.trim()   || null,
        lint:    cmdLint.trim()    || null,
        test:    cmdTest.trim()    || null,
        extra:   cmdExtra.trim()   || null,
      },
    };
  }

  function buildCustomBoard() {
    // Sem view/validação nesse fluxo: só board + repo + colunas. org/project ficam
    // persistidos para o source custom reconstruir o board ao buscar itens depois.
    const cb   = customBoards.find((b) => b.id === customBoard);
    const name = cb?.name || customBoard;
    return {
      id:             customBoard,
      source,
      organizationId: organization,
      projectId:      project,
      repos:          linkedReposPayload(),
      name,
      slug:           boardSlug({ name, viewFilter: "" }),
      boardPath:      "",
      originRepo:     originRepo || null,
      viewFilter:     "",
      repoPath:       "",
      columns:        columnsPayload(),
      validation:     { install: null, build: null, lint: null, test: null, extra: null },
    };
  }

  async function save() {
    if (isCustomSource ? !customBoard : !selected) return;
    setSaving(true);
    try {
      const configRes = await fetch("/api/config");
      const config    = await configRes.json();
      const existing  = config.boards ?? [];

      const newBoard = isCustomSource ? buildCustomBoard() : buildGithubBoard();

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
            <LayoutGrid className="size-4 shrink-0" aria-hidden="true" />
            {t("board.init")}
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5">

          {/* ── Fonte (Source) ── */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Fonte
            </Label>
            {sources.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma fonte conectada. Conecte uma integração na tela de Conexões.
              </p>
            ) : (
              <select
                className={cn(
                  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
                  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  "dark:bg-input/30"
                )}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {sources.map((s) => (
                  <option key={s} value={s}>{s.replace(/[-_]/g, " ")}</option>
                ))}
              </select>
            )}
          </div>

          {/* ── Organização (Custom Kanban) ── */}
          {source === sourcesApi.CUSTOM_KANBAN_SOURCE && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Organização
              </Label>
              {orgsLoading ? (
                <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                  Carregando organizações…
                </div>
              ) : organizations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma organização encontrada.
                </p>
              ) : (
                <select
                  className={cn(
                    "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
                    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    "dark:bg-input/30"
                  )}
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                >
                  <option value="">Selecione a organização…</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── Projeto (Custom Kanban) ── */}
          {source === sourcesApi.CUSTOM_KANBAN_SOURCE && organization && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Projeto
              </Label>
              {projectsLoading ? (
                <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                  Carregando projects…
                </div>
              ) : projects.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum project encontrado nesta organização.
                </p>
              ) : (
                <select
                  className={cn(
                    "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
                    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    "dark:bg-input/30"
                  )}
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">Selecione o project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── Board (Custom Kanban) ── */}
          {source === sourcesApi.CUSTOM_KANBAN_SOURCE && project && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Board
              </Label>
              {customBoardsLoading ? (
                <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                  Carregando boards…
                </div>
              ) : customBoards.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum board encontrado neste project.
                </p>
              ) : (
                <select
                  className={cn(
                    "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
                    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    "dark:bg-input/30"
                  )}
                  value={customBoard}
                  onChange={(e) => setCustomBoard(e.target.value)}
                >
                  <option value="">Selecione o board…</option>
                  {customBoards.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── Repositório (Custom Kanban) ── */}
          {source === sourcesApi.CUSTOM_KANBAN_SOURCE && customBoard && (() => {
            const selectCls = cn(
              "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "dark:bg-input/30"
            );
            const filter = repoFilter.trim().toLowerCase();
            const filtered = filter
              ? customRepos.filter((r) => r.fullName.toLowerCase().includes(filter))
              : customRepos;
            return (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Repositório
                </Label>
                <div className="flex gap-2">
                  {repoHosts.length > 1 && (
                    <select
                      className={cn(selectCls, "w-auto shrink-0")}
                      value={repoHost}
                      onChange={(e) => setRepoHost(e.target.value)}
                      title="Host do repositório"
                    >
                      {repoHosts.map((h) => (
                        <option key={h} value={h}>{h.replace(/[-_]/g, " ")}</option>
                      ))}
                    </select>
                  )}
                  <Input
                    type="text"
                    value={repoFilter}
                    onChange={(e) => setRepoFilter(e.target.value)}
                    placeholder="Filtrar repositórios…"
                    className="flex-1"
                  />
                </div>
                {customReposLoading ? (
                  <div className="border rounded-lg bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                    Carregando repositórios…
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {customRepos.length === 0
                      ? "Nenhum repositório encontrado."
                      : "Nenhum repositório corresponde ao filtro."}
                  </p>
                ) : (
                  <div className="border rounded-lg bg-muted/40 p-1 max-h-64 overflow-y-auto flex flex-col gap-1">
                    {filtered.map((r) => (
                      <button
                        key={r.fullName}
                        type="button"
                        onClick={() => setOriginRepo(r.fullName)}
                        className={cn(
                          "flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-background hover:text-foreground transition",
                          originRepo === r.fullName && "bg-background text-foreground ring-1 ring-primary"
                        )}
                      >
                        <span className="text-sm font-medium flex-1 truncate">{r.fullName}</span>
                        {r.private && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                            privado
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {!customReposLoading && filtered.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {filtered.length} de {customRepos.length} repositórios
                    {originRepo && ` · selecionado: ${originRepo}`}
                  </p>
                )}
              </div>
            );
          })()}

          {/* ── Colunas (Custom Kanban) — só após escolher o repositório ── */}
          {source === sourcesApi.CUSTOM_KANBAN_SOURCE && originRepo && renderColumnsEditor()}

          {/* ── Board ── */}
          {source !== sourcesApi.CUSTOM_KANBAN_SOURCE && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Board
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
          )}

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

              {/* ── Filtro da View ── */}
              {selectedView && (
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="view-filter-input"
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    Filtro da View
                  </Label>
                  <Input
                    id="view-filter-input"
                    type="text"
                    value={viewFilter}
                    onChange={(e) => setViewFilter(e.target.value)}
                    placeholder="ex: repo:owner/repo"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Filtro capturado do GitHub — edite se necessário antes de salvar.
                  </p>
                </div>
              )}

              {/* ── Repositório de Origem ── */}
              {selectedView && (() => {
                const opts = repoOptions(selected, selectedView);
                const selectCls = cn(
                  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
                  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  "dark:bg-input/30"
                );
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
                      <div className="flex gap-2">
                        {repoHosts.length > 1 && (
                          <select
                            className={cn(selectCls, "w-auto shrink-0")}
                            value={repoHost}
                            onChange={(e) => setRepoHost(e.target.value)}
                            title="Host do repositório"
                          >
                            {repoHosts.map((h) => (
                              <option key={h} value={h}>{h.replace(/[-_]/g, " ")}</option>
                            ))}
                          </select>
                        )}
                        <select
                          className={selectCls}
                          value={originRepo}
                          onChange={(e) => setOriginRepo(e.target.value)}
                        >
                          <option value="">Selecione o repositório…</option>
                          {opts.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })()}

              {renderColumnsEditor()}

              {/* ── Comandos de validação ── */}
              <div className="flex flex-col gap-3 border-t pt-3.5 mt-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Comandos de Validação
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cmd-install" className="text-xs text-muted-foreground">
                      Instalação
                    </Label>
                    <Input
                      id="cmd-install"
                      type="text"
                      value={cmdInstall}
                      onChange={(e) => setCmdInstall(e.target.value)}
                      placeholder="npm install"
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cmd-build" className="text-xs text-muted-foreground">
                      Build
                    </Label>
                    <Input
                      id="cmd-build"
                      type="text"
                      value={cmdBuild}
                      onChange={(e) => setCmdBuild(e.target.value)}
                      placeholder="npm run build"
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cmd-lint" className="text-xs text-muted-foreground">
                      Lint
                    </Label>
                    <Input
                      id="cmd-lint"
                      type="text"
                      value={cmdLint}
                      onChange={(e) => setCmdLint(e.target.value)}
                      placeholder="npm run lint"
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cmd-test" className="text-xs text-muted-foreground">
                      Testes
                    </Label>
                    <Input
                      id="cmd-test"
                      type="text"
                      value={cmdTest}
                      onChange={(e) => setCmdTest(e.target.value)}
                      placeholder="npm test"
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="col-span-2 flex flex-col gap-1.5">
                    <Label htmlFor="cmd-extra" className="text-xs text-muted-foreground">
                      Outro
                    </Label>
                    <Input
                      id="cmd-extra"
                      type="text"
                      value={cmdExtra}
                      onChange={(e) => setCmdExtra(e.target.value)}
                      placeholder="comando personalizado"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-4 border-t shrink-0 sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            type="button"
            disabled={
              saving || columnsLoading || activeCols.length === 0 ||
              (isCustomSource
                ? (!customBoard || !originRepo)
                : (!selected || !boardName || !selectedView))
            }
            onClick={save}
          >
            {saving ? t("board.saving") : t("board.add")}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
