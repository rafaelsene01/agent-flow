# 🌸 Hana

Terminal Kanban board powered by Trello. Inspirado no [lisa](https://github.com/tarcisiopgs/lisa).

---

## Instalação (via Node.js)

```bash
npm install
node bin/hana.js --help
# ou instalar globalmente
npm link
hana --help
```

---

## Build — Binário standalone Linux

Nenhum Node.js necessário na máquina destino após o build.

### Pré-requisitos (apenas quem faz o build)

- Node.js >= 18
- npm

### Comandos de build

```bash
npm install

# Linux x64 (padrão)  →  dist/hana
npm run build

# Linux arm64          →  dist/hana-arm64
npm run build:arm

# Todos os alvos       →  dist/hana, hana-arm64, hana-macos, hana.exe
npm run build:all
```

#### Pipeline interno

```
bin/hana.js + src/**
      │
      ▼
  esbuild     →  bundle ESM → CJS único (dist/.bundle.cjs)
      │
      ▼
  pkg         →  CJS + Node runtime → binário estático
      │
      ▼
  dist/hana   →  ~40 MB, sem dependências externas
```

### Usando o binário

```bash
chmod +x dist/hana
./dist/hana --help

# mover para o PATH (opcional)
sudo cp dist/hana /usr/local/bin/hana
hana --help
```

---

## Configuração

Rode uma vez por projeto para criar o `.hana.json` local:

```bash
hana init
```

O wizard pergunta:

1. **Provider** → Trello
2. **API Key** — https://trello.com/app-key
3. **Token** — mesma página, clique em "Token"
4. **Board** (`scope`) — qual quadro usar
5. **Listas visíveis** (`pick_from`) — quais colunas aparecem
6. **In Progress** — coluna de trabalho em andamento
7. **Done** — coluna de concluídos
8. **Label** — filtro opcional por etiqueta

> ⚠️ Adicione `.hana.json` ao `.gitignore` — ele contém sua API key.

---

## Comandos

| Comando       | Alias | Descrição                    |
|---------------|-------|------------------------------|
| `hana`        | —     | Abre o board (padrão)        |
| `hana board`  | `b`   | Abre o board                 |
| `hana init`   | —     | Wizard de configuração       |
| `hana config` | —     | Exibe a config atual         |

---

## Arquivo `.hana.json`

```json
{
  "provider": "trello",
  "api_key": "sua-api-key",
  "api_token": "seu-token",
  "scope": "Nome do Board",
  "_board_id": "id-cacheado",
  "pick_from": ["To Do", "In Progress", "Done"],
  "in_progress": "In Progress",
  "done": "Done",
  "label": "sprint-1"
}
```

| Campo         | Descrição                              |
|---------------|----------------------------------------|
| `scope`       | Nome do board Trello                   |
| `pick_from`   | Listas a exibir (omitir = todas)       |
| `in_progress` | Nome da coluna "Em andamento"          |
| `done`        | Nome da coluna "Concluído"             |
| `label`       | Só exibe cards com essa etiqueta       |

---

## Estrutura do projeto

```
hana/
├── bin/
│   └── hana.js                ← entry point CLI
├── src/
│   ├── config.js              ← lê/escreve .hana.json
│   ├── commands/
│   │   ├── init.js            ← wizard de setup
│   │   ├── board.js           ← busca e renderiza o kanban
│   │   └── config-show.js     ← exibe config atual
│   ├── providers/
│   │   └── trello.js          ← API do Trello
│   └── ui/
│       └── kanban.js          ← renderer de colunas/cards
├── scripts/
│   └── bundle.js              ← pipeline esbuild + pkg
├── dist/                      ← binários gerados (gitignored)
├── .gitignore
├── package.json
└── README.md
```
