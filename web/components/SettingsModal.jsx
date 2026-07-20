"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18nContext";
import { Settings, Check, FolderOpen, RefreshCw, X, Bot, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { getSoundPrefs, setSoundPrefs, playWaiting } from "@/lib/sound";
import { setToken, clearToken } from "@/lib/auth";
import { IntegrationCard, StatusChip } from "@/components/connections/ConnectionCard.jsx";

// Prefill do campo de senha quando já há uma configurada — o valor real (hash)
// nunca chega ao front, então mostramos essa máscara ofuscada. Apagá-la e salvar
// desativa a senha.
const PW_MASK = "········";

const CLAUDE_COMMANDS = [
  { label: "Instalar globalmente (npm)", cmd: "npm install -g @anthropic-ai/claude-code" },
  { label: "Autenticar",                 cmd: "claude" },
];

/* ── LangSwitch ──────────────────────────────────────────────────────────── */
function LangSwitch({ value, onChange }) {
  const options = ["en", "pt"];
  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-muted p-0.5">
      {options.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => onChange(lang)}
          className={cn(
            "px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide transition-colors",
            value === lang
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {lang}
        </button>
      ))}
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
  const { lang: ctxLang, setLang, t }   = useI18n();
  const [language, setLanguage]         = useState(ctxLang);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume]   = useState(0.5);
  const [pwInput, setPwInput]           = useState("");
  const [pwDirty, setPwDirty]           = useState(false);
  const [pwSaving, setPwSaving]         = useState(false);
  const [pwSaved, setPwSaved]           = useState(false);

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
      .then((c) => {
        setProjectsPath(c.projectsPath ?? "");
        setPathInput(c.projectsPath ?? "");
        setLanguage(c.language ?? "en");
        setPwInput(c.authEnabled ? PW_MASK : "");
        setPwDirty(false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const prefs = getSoundPrefs();
    setSoundEnabled(prefs.enabled);
    setSoundVolume(prefs.volume);
  }, []);

  function handleSoundEnabled(enabled) {
    setSoundEnabled(enabled);
    setSoundPrefs({ enabled });
    if (enabled) playWaiting();
  }

  function handleSoundVolume(volume) {
    setSoundVolume(volume);
    setSoundPrefs({ volume });
    if (soundEnabled) playWaiting();
  }

  function saveLanguage(newLang) {
    setLanguage(newLang);
    setLang(newLang);
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: newLang }),
    }).catch(() => {});
  }

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

  async function saveAuth() {
    if (!pwDirty) return;
    setPwSaving(true);
    const password = pwInput; // "" limpa a senha; não-vazia define uma nova
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authPassword: password }),
      });
      if (!res.ok) return;
      // Mantém a sessão válida: ao definir/alterar a senha o token antigo expira,
      // então re-loga com a nova senha; ao limpar, descarta o token.
      if (password) {
        const login = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (login.ok) setToken((await login.json()).token);
        setPwInput(PW_MASK);
      } else {
        clearToken();
        setPwInput("");
      }
      setPwDirty(false);
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setPwSaving(false);
    }
  }

  function browsePath() {
    fetch("/api/config/browse", { method: "POST" })
      .then((r) => r.status === 204 ? null : r.json())
      .then((data) => { if (data?.path) setPathInput(data.path); })
      .catch(() => {});
  }

  // Claude é o motor de execução — sem ele o app não roda, então o modal fica
  // travado até conectar. GitHub deixou de travar: é gerido na tela de Conexões.
  const isLocked = loading || !status?.claude?.connected;

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
            <DialogTitle className="text-base leading-none">{t("settings.title")}</DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            <LangSwitch value={language} onChange={saveLanguage} />
            {!isLocked && (
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                onClick={onClose}
                aria-label="Fechar"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Lock message */}
        {isLocked && !loading && (
          <p className="text-xs text-muted-foreground text-center px-5 pt-3">
            {t("settings.configureToContinue")}
          </p>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <IntegrationCard
            name="Claude"
            logo={<Bot className="size-5" />}
            loading={loading}
            data={status?.claude}
            commands={claudeCommands}
          />

          {/* Projects path card */}
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center size-9 rounded-lg border text-lg shrink-0 text-state-completed bg-state-completed/10 border-state-completed/40">
                <FolderOpen className="size-5" />
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
                {pathSaved ? <><Check className="size-3.5" /> Salvo</> : pathSaving ? "…" : "Salvar"}
              </Button>
            </div>
          </div>

          {/* Access password card */}
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center size-9 rounded-lg border text-lg shrink-0 text-muted-foreground bg-muted border-border">
                <Lock className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-sm font-semibold leading-tight">{t("settings.auth.label")}</span>
                <span className="text-xs text-muted-foreground">{t("settings.auth.desc")}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t pt-3">
              <Input
                type="password"
                className="font-mono text-xs h-8 flex-1"
                value={pwInput}
                onChange={(e) => { setPwInput(e.target.value); setPwDirty(true); }}
                placeholder={t("settings.auth.placeholder")}
                spellCheck={false}
                autoComplete="new-password"
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={pwSaving || !pwDirty}
                onClick={saveAuth}
                className={cn("shrink-0", pwSaved && "text-state-completed border-state-completed")}
              >
                {pwSaved ? <><Check className="size-3.5" /> Salvo</> : pwSaving ? "…" : "Salvar"}
              </Button>
            </div>
          </div>

          {/* Sound effects section */}
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("settings.sound.label")}
              </span>
              <Checkbox
                checked={soundEnabled}
                onCheckedChange={(checked) => handleSoundEnabled(checked === true)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("settings.sound.volume")}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={soundVolume}
                disabled={!soundEnabled}
                onChange={(e) => handleSoundVolume(parseFloat(e.target.value))}
                className="w-full accent-primary disabled:opacity-50"
              />
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
