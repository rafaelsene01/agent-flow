"use client";

import { useState, useEffect } from "react";
import { GitBranch, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Permite: letras ASCII, dígitos, hífen, underscore, barra, ponto.
// Rejeita: acentos, ç e qualquer outra pontuação.
const ALLOWED = /^[a-zA-Z0-9\-_.\/]+$/;

function validateBranchName(name) {
  if (!name) return "Nome obrigatório";
  if (name.length > 250) return "Máximo de 250 caracteres";
  if (!ALLOWED.test(name))
    return "Apenas letras (sem acentos ou ç), números, hífens, underscores, pontos e barras";
  if (name.startsWith("/") || name.endsWith("/")) return "Não pode começar ou terminar com /";
  if (name.includes("//")) return "Não pode conter //";
  if (name.startsWith(".") || name.endsWith(".")) return "Não pode começar ou terminar com ponto";
  if (name.endsWith(".lock")) return "Não pode terminar com .lock";
  if (name.includes("..")) return "Não pode conter dois pontos consecutivos (..)";
  if (name === "@") return "Nome inválido";
  if (name.startsWith("-")) return "Não pode começar com hífen";
  return null;
}

export default function CreateBranchModal({ board, item, onClose }) {
  const [owner, repo] = (board.originRepo ?? "").split("/");
  const cardNumber = item?.number ?? null;

  const [branches, setBranches]               = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError]     = useState(null);
  const [originBranch, setOriginBranch]       = useState(null);

  const [branchFilter, setBranchFilter] = useState("");

  const [newBranch, setNewBranch]       = useState("");
  const [nameError, setNameError]       = useState(null);
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState(null);
  const [lastCreated, setLastCreated]   = useState(null);
  const [worktreeDir, setWorktreeDir]   = useState(null);

  // Radix Dialog handles Esc natively — no manual keydown listener needed.

  useEffect(() => {
    if (!owner || !repo) return;
    setBranchesLoading(true);
    fetch(`/api/github/repos/${owner}/${repo}/branches`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setBranches(data);
      })
      .catch((err) => setBranchesError(err.message))
      .finally(() => setBranchesLoading(false));
  }, [owner, repo]);

  function handleNameChange(e) {
    const val = e.target.value;
    setNewBranch(val);
    setNameError(val ? validateBranchName(val) : null);
    setCreateError(null);
    setLastCreated(null);
    setWorktreeDir(null);
  }

  async function handleCreate() {
    const err = validateBranchName(newBranch);
    if (err) { setNameError(err); return; }
    if (!originBranch) return;

    setCreating(true);
    setCreateError(null);
    try {
      const res  = await fetch(`/api/github/repos/${owner}/${repo}/branches`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ newBranch, originBranch, cardNumber }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLastCreated(newBranch);
      setWorktreeDir(data.worktreeDir ?? null);
      setNewBranch("");
      setNameError(null);
      setTimeout(onClose, 1200);
      // creating permanece true até o modal fechar
    } catch (err) {
      setCreateError(err.message);
      setCreating(false);
    }
  }

  const validationError = newBranch ? validateBranchName(newBranch) : null;
  const canCreate = owner && repo && originBranch && newBranch && !validationError && !creating;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-[480px] p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden"
        showCloseButton={false}
      >
        {/* ── Header ── */}
        <DialogHeader className="flex-row items-center justify-between gap-2 border-b px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground shrink-0" />
            <DialogTitle className="text-sm font-semibold leading-none">
              {cardNumber != null && (
                <span className="font-mono text-muted-foreground mr-1.5">#{cardNumber}</span>
              )}
              Configurar Branch
            </DialogTitle>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={onClose}
            aria-label="Fechar"
          >
            ✕
          </Button>
        </DialogHeader>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5">

          {/* ── Repositório ── */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Repositório
            </Label>
            {!board.originRepo ? (
              <p className="text-xs text-destructive">
                Nenhum repositório de origem configurado. Edite o board para definir um.
              </p>
            ) : (
              <div className="flex items-center gap-2 bg-muted/50 border rounded-lg px-3 py-2">
                <Folder className="size-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium font-mono">{board.originRepo}</span>
              </div>
            )}
          </div>

          {/* ── Branch de Origem ── */}
          {board.originRepo && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Branch de Origem
              </Label>

              {branchesLoading && (
                <p className="text-xs text-muted-foreground">Carregando branches…</p>
              )}
              {branchesError && (
                <p className="text-xs text-destructive">{branchesError}</p>
              )}
              {!branchesLoading && !branchesError && branches.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma branch encontrada.</p>
              )}
              {!branchesLoading && !branchesError && branches.length > 0 && (() => {
                const filtered = branches.filter((b) =>
                  b.name.toLowerCase().includes(branchFilter.toLowerCase())
                );
                return (
                  <>
                    <Input
                      type="text"
                      placeholder="Filtrar branches…"
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      autoComplete="off"
                      spellCheck="false"
                      className="h-8 text-xs"
                    />
                    <div className="border rounded-lg bg-muted/40 p-1 max-h-52 overflow-y-auto flex flex-col gap-1">
                      {filtered.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-3 py-2">
                          Nenhuma branch encontrada para &ldquo;{branchFilter}&rdquo;.
                        </p>
                      ) : (
                        filtered.map((b) => (
                          <button
                            key={b.name}
                            type="button"
                            onClick={() => setOriginBranch(b.name)}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-3 py-2 text-left font-mono text-xs text-muted-foreground hover:bg-background transition",
                              originBranch === b.name && "bg-background text-foreground ring-1 ring-primary"
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full bg-muted-foreground shrink-0",
                                originBranch === b.name && "bg-primary"
                              )}
                            />
                            {b.name}
                          </button>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* ── Nome da nova branch ── */}
          {board.originRepo && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Nome da Nova Branch
              </Label>
              <Input
                type="text"
                placeholder="ex: feature/minha-tarefa"
                value={newBranch}
                onChange={handleNameChange}
                disabled={creating}
                autoComplete="off"
                spellCheck="false"
                className={cn(
                  "font-mono text-xs",
                  nameError && "border-destructive focus-visible:ring-destructive"
                )}
              />
              {nameError && (
                <span className="text-xs text-destructive">{nameError}</span>
              )}
              {!nameError && newBranch && (
                <span className="text-xs text-state-completed">Nome válido ✓</span>
              )}
            </div>
          )}

          {/* ── Feedback ── */}
          {createError && (
            <p className="text-xs text-destructive">{createError}</p>
          )}
          {lastCreated && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-state-completed">
                Branch{" "}
                <code className="font-mono text-[11px] bg-muted border rounded px-1">
                  {lastCreated}
                </code>{" "}
                criada com sucesso ✓
              </p>
              {worktreeDir && (
                <p className="text-xs text-state-completed break-all">
                  Worktree em{" "}
                  <code className="font-mono text-[11px] bg-muted border rounded px-1 break-all">
                    {worktreeDir}
                  </code>
                </p>
              )}
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5 shrink-0">
          <Button variant="secondary" type="button" onClick={onClose}>
            Fechar
          </Button>
          {board.originRepo && (
            <Button
              type="button"
              disabled={!canCreate}
              onClick={handleCreate}
            >
              {creating ? (cardNumber ? "Configurando…" : "Criando…") : "Configurar Branch"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
