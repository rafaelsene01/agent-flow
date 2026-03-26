import { useCallback, useEffect, useRef, useState } from "react";

function api(url, opts) {
  return fetch(url, opts).then(async (r) => {
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("json") ? await r.json() : await r.text();
    if (!r.ok) throw new Error(body?.error || body || `HTTP ${r.status}`);
    return body;
  });
}

function Field({ label, hint, children, error }) {
  return (
    <div className="sf-field">
      <label className="sf-label">{label}</label>
      {hint && <p className="sf-hint">{hint}</p>}
      {children}
      {error && <p className="sf-error">{error}</p>}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder, disabled, monospace }) {
  return (
    <input
      className={`sf-input${monospace ? " mono" : ""}`}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

function Select({ value, onChange, options, disabled, placeholder }) {
  return (
    <select className="sf-input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function MultiCheck({ options, selected, onChange, disabled }) {
  const toggle = (val) => {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    onChange(next);
  };
  return (
    <div className={`sf-checkgrid${disabled ? " disabled" : ""}`}>
      {options.map((o) => (
        <label key={o.value} className={`sf-check ${selected.includes(o.value) ? "checked" : ""}`}>
          <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} disabled={disabled} />
          <span className={`sf-check-dot st-${o.type ?? "unstarted"}`} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function StatusChip({ status }) {
  if (!status) return null;
  const map = {
    loading: ["chip-loading", "…"],
    ok:      ["chip-ok",      "✓"],
    error:   ["chip-error",   "✕"],
  };
  const [cls, icon] = map[status] ?? ["chip-loading", "…"];
  return <span className={`sf-chip ${cls}`}>{icon}</span>;
}

export default function SettingsModal({ onClose, onSaved }) {

  const [cfg, setCfg]           = useState(null);
  const [loadErr, setLoadErr]   = useState("");

  const [provider, setProvider] = useState("linear");
  const [apiKey, setApiKey]     = useState("");
  const [keyStatus, setKeyStatus] = useState(null);
  const [keyUser, setKeyUser]   = useState("");

  const [teams, setTeams]       = useState([]);
  const [teamId, setTeamId]     = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamsStatus, setTeamsStatus] = useState(null);

  const [states, setStates]     = useState([]);
  const [statesStatus, setStatesStatus] = useState(null);
  const [boardColumns, setBoardColumns] = useState([]);
  const [inProgress, setInProgress]     = useState("");
  const [done, setDone]         = useState("");
  const [doneDays, setDoneDays] = useState("0");

  const [labels, setLabels]     = useState([]);
  const [label, setLabel]       = useState("");

  const [gitProvider, setGitProvider]   = useState("");
  const [githubToken, setGithubToken]   = useState("");
  const [githubStatus, setGithubStatus] = useState(null);
  const [githubUser, setGithubUser]     = useState("");
  const githubDebounce = useRef(null);

  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");

  const keyDebounce = useRef(null);

  useEffect(() => {
    api("/api/config")
      .then((c) => {
        setCfg(c);
        setProvider(c.provider || "linear");
        setApiKey(c.api_key || "");
        setTeamId(c._team_id || "");
        setTeamName(c.scope || "");
        setBoardColumns(c.board_columns || []);
        setInProgress(c.in_progress || "");
        setDone(c.done || "");
        setDoneDays(String(c.done_days ?? "0"));
        setLabel(c.label || "");
        setGitProvider(c.git_provider || "");
        setGithubToken(c.git_github_token || "");
        if (c.git_github_token) {
          setGithubStatus("ok");
          setGithubUser(c.git_github_user || "");
        }

        if (c.api_key) {
          setKeyStatus("ok");
          setKeyUser(c.scope ? `Team: ${c.scope}` : "");
        }
      })
      .catch((e) => setLoadErr(e.message));
  }, []);

  useEffect(() => {
    if (apiKey && teamId && keyStatus === "ok") {
      loadTeams(apiKey, teamId);
      loadStates(apiKey, teamId);
      loadLabels(apiKey, teamId);
    }

  }, []);

  useEffect(() => {
    if (!apiKey) { setKeyStatus(null); setKeyUser(""); setTeams([]); setStates([]); setLabels([]); return; }
    clearTimeout(keyDebounce.current);
    keyDebounce.current = setTimeout(() => validateKey(apiKey), 700);
    return () => clearTimeout(keyDebounce.current);
  }, [apiKey]);

  async function validateKey(key) {
    setKeyStatus("loading");
    setKeyUser("");
    try {
      const r = await api("/api/linear/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key }),
      });
      setKeyStatus("ok");
      setKeyUser(`${r.name} · ${r.email}`);
      loadTeams(key, teamId);
    } catch {
      setKeyStatus("error");
      setTeams([]); setStates([]); setLabels([]);
    }
  }

  useEffect(() => {
    if (gitProvider !== "github") { setGithubStatus(null); setGithubUser(""); return; }
    if (!githubToken) { setGithubStatus(null); setGithubUser(""); return; }
    clearTimeout(githubDebounce.current);
    githubDebounce.current = setTimeout(() => validateGithubToken(githubToken), 700);
    return () => clearTimeout(githubDebounce.current);
  }, [githubToken, gitProvider]);

  async function validateGithubToken(token) {
    setGithubStatus("loading");
    setGithubUser("");
    try {
      const r = await api("/api/git/github/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setGithubStatus("ok");
      setGithubUser(r.name ? `${r.name} (@${r.login})` : `@${r.login}`);
    } catch {
      setGithubStatus("error");
    }
  }

  async function loadTeams(key, currentTeamId) {
    setTeamsStatus("loading");
    try {
      const list = await api(`/api/linear/teams?api_key=${encodeURIComponent(key)}`);
      setTeams(list);
      setTeamsStatus("ok");

      if (currentTeamId && list.find((t) => t.id === currentTeamId)) {
        loadStates(key, currentTeamId);
        loadLabels(key, currentTeamId);
      }
    } catch {
      setTeamsStatus("error");
    }
  }

  function handleTeamChange(id) {
    const t = teams.find((t) => t.id === id);
    setTeamId(id);
    setTeamName(t?.name || "");
    setBoardColumns([]);
    setInProgress("");
    setDone("");
    setLabel("");
    setStates([]);
    setLabels([]);
    if (id && apiKey) {
      loadStates(apiKey, id);
      loadLabels(apiKey, id);
    }
  }

  async function loadStates(key, tid) {
    setStatesStatus("loading");
    try {
      const list = await api(`/api/linear/states?api_key=${encodeURIComponent(key)}&team_id=${tid}`);
      setStates(list);
      setStatesStatus("ok");
    } catch {
      setStatesStatus("error");
    }
  }

  async function loadLabels(key, tid) {
    try {
      const list = await api(`/api/linear/labels?api_key=${encodeURIComponent(key)}&team_id=${tid}`);
      setLabels(list);
    } catch {
      setLabels([]);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg("");
    try {
      const next = {
        ...(cfg || {}),
        provider,
        api_key: apiKey,
        scope: teamName,
        _team_id: teamId,
        board_columns: boardColumns.length ? boardColumns : undefined,
        in_progress: inProgress || undefined,
        done: done || undefined,
        done_days: doneDays !== "" && Number(doneDays) > 0 ? Number(doneDays) : undefined,
        label: label || undefined,
        git_provider: gitProvider || undefined,
        git_github_token: gitProvider === "github" && githubToken ? githubToken : undefined,
        git_github_user: gitProvider === "github" && githubUser ? githubUser : undefined,
      };

      Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
      await api("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setSaveMsg("✓ Salvo! O board será atualizado no próximo refresh.");
      onSaved?.();
    } catch (e) {
      setSaveMsg(`✕ Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const stateOptions = states.map((s) => ({ value: s.name, label: s.name, type: s.type }));
  const namedStates  = states.filter((s) => boardColumns.includes(s.name));
  const namedOptions = namedStates.map((s) => ({ value: s.name, label: s.name }));
  const canSave      = keyStatus === "ok" && !!teamId && !saving;

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <div className="modal-id-row">
            <span className="settings-icon">⚙</span>
            <h2 className="modal-title" style={{ fontSize: 16, marginBottom: 0 }}>Configurações</h2>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loadErr && <p className="sf-error" style={{ marginTop: 8 }}>{loadErr}</p>}

        <div className="sf-body">

          <div className="sf-section-title">Git</div>

          <Field label="Provedor Git" hint="Opcional. Conecte um repositório ao board.">
            <Select
              value={gitProvider}
              onChange={(v) => { setGitProvider(v); setGithubToken(""); setGithubStatus(null); setGithubUser(""); }}
              options={[{ value: "github", label: "GitHub" }]}
              placeholder="(nenhum)"
            />
          </Field>

          {gitProvider === "github" && (
            <Field
              label="GitHub Token"
              hint="Crie em github.com/settings/tokens — permissão repo."
            >
              <div className="sf-row">
                <Input
                  type="password"
                  value={githubToken}
                  onChange={setGithubToken}
                  placeholder="ghp_xxxxxxxxxxxx"
                  monospace
                />
                <StatusChip status={githubStatus} />
              </div>
              {githubStatus === "ok"    && <p className="sf-hint ok">{githubUser}</p>}
              {githubStatus === "error" && <p className="sf-hint err">Token inválido</p>}
            </Field>
          )}

          <div className="sf-section-title">Source</div>

          <Field label="Provider">
            <Select
              value={provider}
              onChange={setProvider}
              options={[{ value: "linear", label: "Linear" }]}
            />
          </Field>

          <Field
            label="API Key"
            hint={provider === "linear" ? "Obtenha em linear.app/settings/api" : undefined}
          >
            <div className="sf-row">
              <Input
                type="password"
                value={apiKey}
                onChange={setApiKey}
                placeholder="lin_api_xxxxxxxxxxxx"
                monospace
              />
              <StatusChip status={keyStatus} />
            </div>
            {keyStatus === "ok"    && <p className="sf-hint ok">{keyUser}</p>}
            {keyStatus === "error" && <p className="sf-hint err">API key inválida</p>}
          </Field>

          <Field label="Time (scope)">
            <div className="sf-row">
              <Select
                value={teamId}
                onChange={handleTeamChange}
                options={teams.map((t) => ({ value: t.id, label: `${t.name}  [${t.key}]` }))}
                disabled={keyStatus !== "ok" || teamsStatus === "loading"}
                placeholder={teamsStatus === "loading" ? "Carregando…" : "Selecione um time"}
              />
              <StatusChip status={teamsStatus} />
            </div>
          </Field>

          <Field
            label="Colunas do board"
            hint="Quais estados aparecem como colunas. Deixe vazio para exibir todos."
          >
            <div className="sf-row" style={{ alignItems: "flex-start" }}>
              <MultiCheck
                options={stateOptions}
                selected={boardColumns}
                onChange={setBoardColumns}
                disabled={!teamId || statesStatus === "loading"}
              />
              <StatusChip status={statesStatus} />
            </div>
          </Field>

          <div className="sf-two-col">
            <Field label="Estado 'In Progress'">
              <Select
                value={inProgress}
                onChange={setInProgress}
                options={namedOptions}
                disabled={namedOptions.length === 0}
                placeholder="(nenhum)"
              />
            </Field>
            <Field label="Estado 'Done'">
              <Select
                value={done}
                onChange={setDone}
                options={namedOptions}
                disabled={namedOptions.length === 0}
                placeholder="(nenhum)"
              />
            </Field>
          </div>

          {done && (
            <Field
              label="Dias visíveis no Done"
              hint={
                doneDays === "0" || doneDays === ""
                  ? "Mostrando todos os cards concluídos."
                  : `Mostrando apenas cards finalizados nos últimos ${doneDays} dia${Number(doneDays) !== 1 ? "s" : ""} (a partir de ${(() => { const d = new Date(); d.setDate(d.getDate() - Number(doneDays)); return d.toLocaleDateString("pt-BR"); })()}).`
              }
            >
              <div className="sf-row">
                <input
                  className="sf-input sf-input-number"
                  type="number"
                  min="0"
                  step="1"
                  value={doneDays}
                  onFocus={() => {

                    setDoneDays("");
                  }}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0)) setDoneDays(v);
                  }}
                  placeholder="0"
                />
                <span className="sf-unit">dias</span>
                {(doneDays === "0" || doneDays === "") && (
                  <span className="sf-unit-hint">0 = sem filtro</span>
                )}
              </div>
            </Field>
          )}

          <Field label="Filtro por label" hint="Opcional. Exibe apenas issues com esta etiqueta.">
            <Select
              value={label}
              onChange={setLabel}
              options={labels.map((l) => ({ value: l.name, label: l.name }))}
              disabled={labels.length === 0}
              placeholder="(sem filtro)"
            />
          </Field>

        </div>{}

        <div className="sf-footer">
          {saveMsg && (
            <p className={`sf-save-msg ${saveMsg.startsWith("✓") ? "ok" : "err"}`}>{saveMsg}</p>
          )}
          <div className="sf-footer-actions">
            <button className="btn-secondary" onClick={onClose} type="button">Cancelar</button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!canSave}
              type="button"
            >
              {saving ? "Salvando…" : "Salvar configuração"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
