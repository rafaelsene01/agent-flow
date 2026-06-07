"use client";

import { useCallback, useEffect, useState } from "react";

const GH_INSTALL = {
  win32:  { label: "Instalar (winget)",   cmd: "winget install --id GitHub.cli" },
  darwin: { label: "Instalar (Homebrew)", cmd: "brew install gh" },
  linux:  { label: "Instalar (apt)",      cmd: "sudo apt install gh" },
};

const CLAUDE_COMMANDS = [
  { label: "Instalar globalmente (npm)", cmd: "npm install -g @anthropic-ai/claude-code" },
  { label: "Autenticar",                 cmd: "claude" },
];

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
    <button
      className={`cmd-copy${copied ? " copied" : ""}`}
      type="button"
      title={copied ? "Copiado!" : "Copiar"}
      onClick={copy}
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

function CommandBlock({ label, cmd }) {
  return (
    <div className="cmd-block">
      <div className="cmd-label">{label}</div>
      <div className="cmd-row">
        <code className="cmd-code">{cmd}</code>
        <CopyButton text={cmd} />
      </div>
    </div>
  );
}

function IntegrationCard({ name, logo, loading, data, commands }) {
  const connected = !loading && !!data?.connected;
  const failed    = !loading && !data?.connected;

  return (
    <div className="intg-card">
      <div className="intg-top">
        <div className={`intg-logo${loading ? "" : connected ? " ok" : " err"}`}>
          {logo}
        </div>

        <div className="intg-body">
          <div className="intg-name">{name}</div>

          {loading && <div className="intg-status">Verificando…</div>}

          {connected && (
            <>
              {data.user && (
                <div className="intg-status ok">
                  @{data.user}{data.name ? ` — ${data.name}` : ""}
                </div>
              )}
              {data.version && <div className="intg-status ok">{data.version}</div>}
              {!data.user && !data.version && <div className="intg-status ok">Conectado</div>}
              <div className="intg-detail">
                {data.method === "env"         ? "via variável de ambiente" :
                 data.method === "gh-cli"      ? "via gh CLI"               :
                 data.method === "ssh"         ? "via chave SSH"            :
                 data.method === "claude-cli"  ? "via claude CLI"            : data.method}
              </div>
            </>
          )}

          {failed && (
            <div className="intg-status err">
              {data?.error || "Não configurado"}
            </div>
          )}
        </div>

        <div className={`intg-badge${loading ? " badge-loading" : connected ? " badge-ok" : " badge-err"}`}>
          {loading ? "…" : connected ? "✓" : "✕"}
        </div>
      </div>

      {failed && commands?.length > 0 && (
        <div className="cmd-list">
          {commands.map((c) => (
            <CommandBlock key={c.cmd} label={c.label} cmd={c.cmd} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsModal({ onClose }) {
  const [status, setStatus]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [projectsPath, setProjectsPath] = useState("");
  const [pathInput, setPathInput]   = useState("");
  const [pathSaving, setPathSaving] = useState(false);
  const [pathSaved, setPathSaved]   = useState(false);

  const fetchStatus = useCallback(() => {
    setLoading(true);
    fetch("/api/status")
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

  useEffect(() => {
    const h = (e) => { if (!isLocked && e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isLocked, onClose]);

  const platform      = status?.platform ?? "linux";
  const installCmd    = GH_INSTALL[platform] ?? GH_INSTALL.linux;
  const githubCommands = !loading && !status?.github?.connected
    ? [installCmd, { label: "Autenticar", cmd: "gh auth login" }]
    : [];
  const claudeCommands = !loading && !status?.claude?.connected
    ? CLAUDE_COMMANDS
    : [];

  return (
    <div className="backdrop" onClick={isLocked ? undefined : onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <div className="modal-id-row">
            <span className="settings-icon">⚙</span>
            <h2 className="modal-title" style={{ fontSize: 16, marginBottom: 0 }}>
              Integrações
            </h2>
          </div>
          {!isLocked && (
            <button className="modal-close" type="button" onClick={onClose}>✕</button>
          )}
        </div>

        {isLocked && !loading && (
          <p className="intg-lock-msg">
            Configure as integrações abaixo para continuar.
          </p>
        )}

        <div className="sf-body">
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

          <div className="intg-card">
            <div className="intg-top">
              <div className="intg-logo ok">◉</div>
              <div className="intg-body">
                <div className="intg-name">Projects</div>
                <div className="intg-status ok">Configurado</div>
                {projectsPath && (
                  <div className="intg-detail">{projectsPath}</div>
                )}
              </div>
            </div>
            <div className="path-editor">
              <button
                className="btn-browse"
                type="button"
                title="Selecionar pasta"
                onClick={browsePath}
              >
                ⊞
              </button>
              <input
                className="path-input"
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="Caminho para a pasta projects"
                spellCheck={false}
              />
              <button
                className={`btn-secondary${pathSaved ? " saved" : ""}`}
                type="button"
                disabled={pathSaving || pathInput === projectsPath}
                onClick={savePath}
              >
                {pathSaved ? "✓ Salvo" : pathSaving ? "…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>

        <div className="sf-footer">
          <div className="sf-footer-actions">
            <button className="btn-secondary" type="button" onClick={fetchStatus} disabled={loading}>
              {loading ? "Verificando…" : "↻ Verificar"}
            </button>
            {!isLocked && (
              <button className="btn-primary" type="button" onClick={onClose}>
                Fechar
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
