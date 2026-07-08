# Agent Flow

Kanban board para GitHub Projects V2. Roda local, interface web.

---

## Instalação

```bash
npm install     # instala os pacotes
npm run build   # gera o build
npm i -g .      # instala global
```

### Desinstalar

```bash
npm uninstall -g agent-flow
```

---

## Daemon

Mantém o servidor rodando em background: o supervisor (`daemon.ps1`/`daemon.sh`) instala dependências/build se faltarem, monitora `GET /api/status` e, em caso de crash ou health check falhando, mata o servidor e todos os `claude` disparados por ele (`kill-all.ps1`/`kill-all.sh`) e reinicia com backoff.

**Atualização (com autorização):** o servidor detecta versão nova no remoto e mostra um badge na sidebar; nada atualiza sozinho. Ao clicar, um diálogo pede confirmação — e avisa se houver execuções do Claude em andamento, pois elas serão encerradas. Só após confirmar o daemon faz `git pull --ff-only` + `npm install` + build e reinicia o servidor na versão nova. Requer que a instalação seja um clone git com upstream (o instalador de uma linha já garante isso) e o daemon rodando. A remoção mata todos os processos do Agent Flow, incluindo claudes órfãos dos runs (identificados por `--output-format stream-json` + `--dangerously-skip-permissions`; sessões `claude` interativas não são afetadas).

Depois de instalado, acesse **http://localhost:5522** (porta default `5522`; muda se você instalou com porta customizada). Logs em `~/.agent-flow/daemon.log` (+ `server.out.log` / `server.err.log`).

### Instalação em uma linha

O comando baixa o script bootstrap e o executa: ele clona o repo em `~/.agent-flow/app` (ou atualiza com `git pull` se já existir) e instala o daemon do sistema. Só precisa de `git` — **se não houver Node ≥ 22, o bootstrap instala sozinho**: no Linux/macOS baixa o tarball oficial para uma cópia local em `~/.agent-flow/node` (sem sudo, independente de distro); no Windows instala via `winget`.

**Linux e macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/rafaelsene01/agent-flow/master/scripts/daemon/get.sh | bash
```

Porta customizada: `curl -fsSL .../get.sh | bash -s -- 8080`.

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/rafaelsene01/agent-flow/master/scripts/daemon/get.ps1 | iex
```

Porta customizada: `$env:AGENT_FLOW_PORT = 8080; irm .../get.ps1 | iex`. No Git Bash o comando `curl` do Linux também funciona (delega ao instalador do Windows).

### Remover

```bash
# Linux e macOS
bash ~/.agent-flow/app/scripts/daemon/uninstall.sh

# Windows
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.agent-flow\app\scripts\daemon\uninstall.ps1"
```

(Se instalou a partir de um clone próprio, rode o `uninstall` de `scripts/daemon/` desse clone.)

### Como funciona por sistema

| Sistema | Mecanismo | Comportamento |
|---------|-----------|---------------|
| Linux | systemd `--user` (`agent-flow-daemon`) | Sobe no boot via linger; `Restart=always` revive o supervisor. Status: `systemctl --user status agent-flow-daemon` |
| macOS | LaunchAgent (`com.agentflow.daemon`) | Sobe no login; `KeepAlive` revive o supervisor |
| Windows | Scheduled Task (`AgentFlowDaemon`) | Sobe no logon, roda escondido; Task Scheduler revive o supervisor |

Instalação manual (clone local): `bash scripts/daemon/install.sh [porta]` (Linux/macOS) ou `powershell -ExecutionPolicy Bypass -File scripts\daemon\install.ps1 [-Port 8080]` (Windows).

---

## Uso

```bash
agent-flow          # sobe na porta 5522
agent-flow -p 8080  # porta customizada
```

---

## Pré-requisitos

- **GitHub:** `gh auth login -s read:project` ou `GH_TOKEN`/`GITHUB_TOKEN` no ambiente (token precisa do scope `read:project` para listar boards do Projects). Já logado sem o scope? `gh auth refresh -s read:project`
- **Claude:** `claude` CLI instalado e autenticado

Config em `~/.agent-flow/config.json` (criado automaticamente na primeira execução).
