# 🌸 Hana

Web Kanban board powered by Linear. Inspirado no [lisa](https://github.com/tarcisiopgs/lisa).

---

## Instalação global

```bash
npm install
npm install -g .

hana --help
```

### Desinstalar

```bash
npm uninstall -g hana
```

---

## Primeira configuração

Rode uma vez por projeto para criar o `.hana.json` local:

```bash
cd meu-projeto/
hana init
```

O wizard pergunta:

1. **Provider** → Linear
2. **API Key** — obtenha em: https://linear.app/settings/api
3. **Team** (`scope`) — qual time usar
4. **States visíveis do board** (`board_columns`) — quais colunas aparecem no kanban
5. **States para IA** (`pick_from`) — de onde a IA pode ler atividades
6. **In Progress** — estado de trabalho em andamento
7. **Done** — estado de concluído
8. **Label** — filtro opcional por etiqueta

> ⚠️ Adicione `.hana.json` ao `.gitignore` — ele contém sua API key.

---

## Comandos

| Comando       | Alias | Descrição                                      |
|---------------|-------|------------------------------------------------|
| `hana`        | —     | Inicia servidor web do board na porta `5522`  |
| `hana board`  | `b`   | Inicia servidor web do board                   |
| `hana init`   | —     | Wizard de configuração                         |
| `hana config` | —     | Exibe a config atual                           |

### Porta do servidor web

Por padrão, o board sobe na porta `5522`. Você pode alterar com `-p` ou `--port`:

```bash
hana board -p 8080
hana board --port 7000
```

Ao iniciar, o comando exibe a URL local para acesso no navegador.

> Fluxo oficial: use apenas `hana board`. A interface web e a API rodam na mesma porta.

---

## Arquivo `.hana.json`

```json
{
  "provider": "linear",
  "api_key": "lin_api_xxxx",
  "scope": "Nome do Time",
  "_team_id": "id-cacheado",
  "board_columns": ["Todo", "In Progress", "Done"],
  "pick_from": ["Todo", "In Progress", "Done"],
  "in_progress": "In Progress",
  "done": "Done",
  "label": "sprint-1"
}
```

| Campo         | Descrição                                        |
|---------------|--------------------------------------------------|
| `scope`       | Nome do time no Linear                           |
| `board_columns` | States exibidos como colunas no board (omitir = todos) |
| `pick_from`   | States que a IA usa como origem de atividades (omitir = todos) |
| `in_progress` | Nome do state "Em andamento"                     |
| `done`        | Nome do state "Concluído"                        |
| `label`       | Só exibe issues com essa etiqueta                |

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
│   │   ├── board.js           ← busca dados e sobe o board web
│   │   └── config-show.js     ← exibe config atual
│   ├── providers/
│   │   └── linear.js          ← API GraphQL do Linear
│   └── server/
│       └── board-server.js    ← servidor HTTP local + API
├── web/
│   ├── src/
│   │   ├── App.jsx            ← UI web do kanban
│   │   └── main.jsx           ← bootstrap do React
│   └── vite.config.js         ← build do frontend
├── .gitignore
├── package.json
└── README.md
```
