# Módulo — Status

Fonte: `api/modules/status/status.cache.js`

Status agregado (`platform` + `github.getStatus()` + `claude.getStatus()`). **Sem cache persistente**: a rota consulta uma vez por abertura de tela, e cachear congelava erros transitórios (GitHub 503 no boot ficava "fora do ar" para sempre). Só deduplica chamadas concorrentes em voo (promise compartilhada).

---

## Exports

- `refresh()` — recalcula chamando os `getStatus()` dos módulos [github](github.md) e [claude](claude.md) em paralelo e retorna `{ platform, github, claude, cachedAt }`. Chamadas concorrentes compartilham a mesma promise.
