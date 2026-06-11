# Agent Flow

Kanban board para GitHub Projects V2. Roda local, interface web.

---

## Instalação

```bash
npm i -g @rafaelsene01/agent-flow
```

### Desinstalar

```bash
npm uninstall -g @rafaelsene01/agent-flow
```

---

## Uso

```bash
agent-flow          # sobe na porta 5522
agent-flow -p 8080  # porta customizada
```

---

## Pré-requisitos

- **GitHub:** `gh auth login` ou `GH_TOKEN`/`GITHUB_TOKEN` no ambiente
- **Claude:** `claude` CLI instalado e autenticado

Config em `~/.agent-flow/config.json` (criado automaticamente na primeira execução).
