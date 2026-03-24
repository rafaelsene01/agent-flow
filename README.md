# 🌸 Hana

Terminal Kanban board powered by Linear. Inspirado no [lisa](https://github.com/tarcisiopgs/lisa).

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
4. **States visíveis** (`pick_from`) — quais colunas aparecem no kanban
5. **In Progress** — estado de trabalho em andamento
6. **Done** — estado de concluído
7. **Label** — filtro opcional por etiqueta

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
  "provider": "linear",
  "api_key": "lin_api_xxxx",
  "scope": "Nome do Time",
  "_team_id": "id-cacheado",
  "pick_from": ["Todo", "In Progress", "Done"],
  "in_progress": "In Progress",
  "done": "Done",
  "label": "sprint-1"
}
```

| Campo         | Descrição                                        |
|---------------|--------------------------------------------------|
| `scope`       | Nome do time no Linear                           |
| `pick_from`   | States a exibir como colunas (omitir = todos)    |
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
│   │   ├── board.js           ← busca e renderiza o kanban
│   │   └── config-show.js     ← exibe config atual
│   ├── providers/
│   │   └── linear.js          ← API GraphQL do Linear
│   └── ui/
│       └── kanban.js          ← renderer de colunas/cards
├── .gitignore
├── package.json
└── README.md
```
