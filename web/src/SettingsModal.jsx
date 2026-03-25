import { useCallback, useEffect, useRef, useState } from "react";

// ── tiny helpers ──────────────────────────────────────────────────────────────

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

// ── main ──────────────────────────────────────────────────────────────────────

export default function SettingsModal({ onClose, onSaved }) {
  // raw config
  const [cfg, setCfg]           = useState(null);
  const [loadErr, setLoadErr]   = useState("");

  // field state
  const [provider, setProvider] = useState("linear");
  const [apiKey, setApiKey]     = useState("");
  const [keyStatus, setKeyStatus] = useState(null); // null | loading | ok | error
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

  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");

  const keyDebounce = useRef(null);

  // ── load current config ────────────────────────────────────────────────────
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
        // if key exists, mark as ok immediately and load downstream
        if (c.api_key) {
          setKeyStatus("ok");
          setKeyUser(c.scope ? `Team: ${c.scope}` : "");
        }
      })
      .catch((e) => setLoadErr(e.message));
  }, []);

  // when we have key + teamId from config, load states & labels
  useEffect(() => {
    if (apiKey && teamId && keyStatus === "ok") {
      loadTeams(apiKey, teamId);
      loadStates(apiKey, teamId);
      loadLabels(apiKey, teamId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once after config loads

  // ── validate key (debounced on change) ────────────────────────────────────
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

  // ── load teams ─────────────────────────────────────────────────────────────
  async function loadTeams(key, currentTeamId) {
    setTeamsStatus("loading");
    try {
      const list = await api(`/api/linear/teams?api_key=${encodeURIComponent(key)}`);
      setTeams(list);
      setTeamsStatus("ok");
      // auto-select if already configured
      if (currentTeamId && list.find((t) => t.id === currentTeamId)) {
        loadStates(key, currentTeamId);
        loadLabels(key, currentTeamId);
      }
    } catch {
      setTeamsStatus("error");
    }
  }

  // ── team selected ──────────────────────────────────────────────────────────
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

  // ── save ───────────────────────────────────────────────────────────────────
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
      };
      // strip undefined keys
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

  // ── close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // ── derived ────────────────────────────────────────────────────────────────
  const stateOptions = states.map((s) => ({ value: s.name, label: s.name, type: s.type }));
  const namedStates  = states.filter((s) => boardColumns.includes(s.name));
  const namedOptions = namedStates.map((s) => ({ value: s.name, label: s.name }));
  const canSave      = keyStatus === "ok" && !!teamId && !saving;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>

        {/* header */}
        <div className="modal-header">
          <div className="modal-id-row">
            <span className="settings-icon">⚙</span>
            <h2 className="modal-title" style={{ fontSize: 16, marginBottom: 0 }}>Configurações</h2>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loadErr && <p className="sf-error" style={{ marginTop: 8 }}>{loadErr}</p>}

        <div className="sf-body">

          {/* provider */}
          <Field label="Provider">
            <Select
              value={provider}
              onChange={setProvider}
              options={[{ value: "linear", label: "Linear" }]}
            />
          </Field>

          {/* api key */}
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

          {/* team */}
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

          {/* board columns */}
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

          {/* in progress + done — only among selected columns */}
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

          {/* done_days — only visible when a done state is selected */}
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
                    // Limpa sempre que o usuário clicar/entrar no campo.
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

          {/* label filter */}
          <Field label="Filtro por label" hint="Opcional. Exibe apenas issues com esta etiqueta.">
            <Select
              value={label}
              onChange={setLabel}
              options={labels.map((l) => ({ value: l.name, label: l.name }))}
              disabled={labels.length === 0}
              placeholder="(sem filtro)"
            />
          </Field>

        </div>{/* /sf-body */}

        {/* footer */}
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
