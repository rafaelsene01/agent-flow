# 🌸 Hana

Terminal Kanban board powered by Trello. Inspirado no [lisa](https://github.com/tarcisiopgs/lisa).

---

## Instalação global (recomendado)

Igual instalar qualquer ferramenta de linha de comando via npm:

```bash
# Dentro da pasta do projeto
npm install
npm install -g .
```

Pronto. O comando `hana` fica disponível em qualquer terminal:

```
hana --help
hana init
hana board
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

1. **Provider** → Trello
2. **API Key** — obtenha em: https://trello.com/app-key
3. **Token** — mesma página, clique em "Token"
4. **Board** (`scope`) — qual quadro usar
5. **Listas visíveis** (`pick_from`) — quais colunas aparecem no kanban
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
├── .gitignore
├── package.json
└── README.md
```
