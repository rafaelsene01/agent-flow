# Agent Flow

Kanban board para GitHub Projects V2. Roda local, interface web.

---

## Instalação

```bash
npm install
npm install -g .
```

### Desinstalar

```bash
npm uninstall -g agent-flow
```

---

## Uso

```bash
agent-flow          # sobe na porta 5522
agent-flow -p 8080  # porta customizada
```

Sem instalação global:

```bash
npm run dev     # API (5522) + Next.js (3001) com hot reload
npm start       # build + serve tudo via Express (produção)
```

---

## Pré-requisitos

- **GitHub:** `gh auth login` ou `GH_TOKEN`/`GITHUB_TOKEN` no ambiente
- **Claude:** `claude` CLI instalado e autenticado

Config em `~/.agent-flow/config.json` (criado automaticamente na primeira execução).
