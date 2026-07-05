# Módulo — Usage

Fonte: `api/modules/usage/usage.store.js`

Estatísticas de execução dos agentes (tokens/custo por run), persistidas em SQLite. Alimenta a tela `/usage` via `/api/usage-stats` — não confundir com `/api/usage` (limites do plano, implementado direto em `api/routes/usage.js`).

---

## Exports

- `recordUsage({ ... })` — grava o registro de um run (chamado pelo runner de agent-runs).
- `listUsage({ repo, days })` — registros filtrados por repo e janela de dias.
- `clearUsage()` — apaga tudo; retorna a quantidade removida.
