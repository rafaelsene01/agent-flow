"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, Copy, Check, FolderOpen, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GH_INSTALL = {
  win32:  { label: "Instalar (winget)",   cmd: "winget install --id GitHub.cli" },
  darwin: { label: "Instalar (Homebrew)", cmd: "brew install gh" },
  linux:  { label: "Instalar (apt)",      cmd: "sudo apt install gh" },
};

const CLAUDE_COMMANDS = [
  { label: "Instalar globalmente (npm)", cmd: "npm install -g @anthropic-ai/claude-code" },
  { label: "Autenticar",                 cmd: "claude" },
];

/* ── CopyButton ─────────────────────────────────────────────────────────── */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    function flash() {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    function fallback() {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      flash();
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(flash).catch(fallback);
    } else {
      fallback();
    }
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
function CommandBlock({ label, cmd }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
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
function StatusChip({ loading, connected }) {
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
        ✓
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center size-6 rounded-full text-xs font-medium bg-destructive/15 text-destructive border border-destructive/40">
      ✕
    </span>
  );
}

/* ── WarnChip ────────────────────────────────────────────────────────────── */
function WarnChip({ loading }) {
  if (loading) {
    return (
      <span className="inline-flex items-center justify-center size-6 rounded-full text-xs font-medium animate-pulse text-muted-foreground bg-muted border border-border">
        …
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center size-6 rounded-full text-xs font-medium bg-priority-high/15 text-priority-high border border-priority-high/40">
      !
    </span>
  );
}

/* ── IntegrationCard ─────────────────────────────────────────────────────── */
function IntegrationCard({ name, logo, loading, data, commands }) {
  const connected = !loading && !!data?.connected;
  const failed    = !loading && !data?.connected;

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
                 data.method === "claude-cli" ? "via claude CLI"           : data.method}
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
      {failed && commands?.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-3">
          {commands.map((c) => (
            <CommandBlock key={c.cmd} label={c.label} cmd={c.cmd} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── SkillCard ───────────────────────────────────────────────────────────── */
function SkillCard({ loading, installed, onInstalled, skill, name, description }) {
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState(null);

  function install() {
    setInstalling(true);
    setInstallError(null);
    fetch("/api/status/install-skill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        onInstalled(data);
      })
      .catch((err) => setInstallError(err.message))
      .finally(() => setInstalling(false));
  }

  const logoClass = cn(
    "flex items-center justify-center size-9 rounded-lg border text-lg shrink-0",
    loading     && "text-muted-foreground bg-muted border-border",
    !loading && installed   && "text-state-completed bg-state-completed/10 border-state-completed/40",
    !loading && !installed  && "text-priority-high bg-priority-high/10 border-priority-high/40"
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={logoClass}>⚡</div>

        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-sm font-semibold leading-tight">Skill: {name}</span>

          {loading && (
            <span className="text-xs text-muted-foreground">Verificando…</span>
          )}

          {!loading && installed && (
            <span className="text-xs text-state-completed">Instalada globalmente</span>
          )}

          {!loading && !installed && (
            <>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-priority-high">Não instalada</span>
                <Button
                  variant="outline"
                  size="xs"
                  type="button"
                  disabled={installing}
                  onClick={install}
                >
                  {installing ? "…" : "Instalar"}
                </Button>
              </div>
              {installError && (
                <span className="text-xs text-destructive mt-0.5">{installError}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {description}
              </span>
            </>
          )}
        </div>

        {loading ? (
          <WarnChip loading={true} />
        ) : installed ? (
          <StatusChip loading={false} connected={true} />
        ) : (
          <WarnChip loading={false} />
        )}
      </div>
    </div>
  );
}

/* ── SettingsModal ───────────────────────────────────────────────────────── */
export default function SettingsModal({ onClose }) {
  const [status, setStatus]             = useState(null);
  const [loading, setLoading]           = useState(true);
  const [projectsPath, setProjectsPath] = useState("");
  const [pathInput, setPathInput]       = useState("");
  const [pathSaving, setPathSaving]     = useState(false);
  const [pathSaved, setPathSaved]       = useState(false);

  const fetchStatus = useCallback((force = false) => {
    setLoading(true);
    fetch("/api/status", force ? { method: "POST" } : undefined)
      .then((r) => r.json())
      .then((s) => { setStatus(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => { setProjectsPath(c.projectsPath ?? ""); setPathInput(c.projectsPath ?? ""); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  function savePath() {
    setPathSaving(true);
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectsPath: pathInput }),
    })
      .then((r) => r.json())
      .then((c) => {
        setProjectsPath(c.projectsPath);
        setPathInput(c.projectsPath);
        setPathSaved(true);
        setTimeout(() => setPathSaved(false), 2000);
      })
      .catch(() => {})
      .finally(() => setPathSaving(false));
  }

  function browsePath() {
    fetch("/api/config/browse", { method: "POST" })
      .then((r) => r.status === 204 ? null : r.json())
      .then((data) => { if (data?.path) setPathInput(data.path); })
      .catch(() => {});
  }

  const isLocked = loading || !status?.github?.connected || !status?.claude?.connected;

  const platform       = status?.platform ?? "linux";
  const installCmd     = GH_INSTALL[platform] ?? GH_INSTALL.linux;
  const githubCommands = !loading && !status?.github?.connected
    ? [installCmd, { label: "Autenticar", cmd: "gh auth login" }]
    : [];
  const claudeCommands = !loading && !status?.claude?.connected
    ? CLAUDE_COMMANDS
    : [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isLocked) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[580px] p-0 gap-0 max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="size-4 text-muted-foreground" />
            <DialogTitle className="text-base leading-none">Integrações</DialogTitle>
          </div>
          {!isLocked && (
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={onClose}
              aria-label="Fechar"
            >
              ✕
            </Button>
          )}
        </div>

        {/* Lock message */}
        {isLocked && !loading && (
          <p className="text-xs text-muted-foreground text-center px-5 pt-3">
            Configure as integrações abaixo para continuar.
          </p>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <IntegrationCard
            name="GitHub"
            logo="⬡"
            loading={loading}
            data={status?.github}
            commands={githubCommands}
          />
          <IntegrationCard
            name="Claude"
            logo="◆"
            loading={loading}
            data={status?.claude}
            commands={claudeCommands}
          />

          <SkillCard
            loading={loading}
            installed={status?.claude?.tlcSkill ?? false}
            onInstalled={setStatus}
            skill="tlc-spec-driven"
            name="tlc-spec-driven"
            description="Recomendada para planejamento de features com IA"
          />

          <SkillCard
            loading={loading}
            installed={status?.claude?.specDrivenEvalSkill ?? false}
            onInstalled={setStatus}
            skill="spec-driven-eval"
            name="spec-driven-eval"
            description="Recomendada para avaliar implementações contra a spec/PRD"
          />

          {/* Projects path card */}
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center size-9 rounded-lg border text-lg shrink-0 text-state-completed bg-state-completed/10 border-state-completed/40">
                ◉
              </div>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-sm font-semibold leading-tight">Projects</span>
                <span className="text-xs text-state-completed">Configurado</span>
                {projectsPath && (
                  <span className="text-xs text-muted-foreground truncate">{projectsPath}</span>
                )}
              </div>
              <StatusChip loading={false} connected={true} />
            </div>

            {/* Path editor */}
            <div className="flex items-center gap-2 border-t pt-3">
              <Button
                variant="outline"
                size="icon-sm"
                type="button"
                title="Selecionar pasta"
                onClick={browsePath}
                aria-label="Selecionar pasta"
              >
                <FolderOpen className="size-3.5" />
              </Button>
              <Input
                type="text"
                className="font-mono text-xs h-8 flex-1"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="Caminho para a pasta projects"
                spellCheck={false}
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={pathSaving || pathInput === projectsPath}
                onClick={savePath}
                className={cn(
                  "shrink-0",
                  pathSaved && "text-state-completed border-state-completed"
                )}
              >
                {pathSaved ? "✓ Salvo" : pathSaving ? "…" : "Salvar"}
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => fetchStatus(true)}
              disabled={loading}
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              {loading ? "Verificando…" : "Verificar"}
            </Button>
            {!isLocked && (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={onClose}
              >
                Fechar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
