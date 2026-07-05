# Módulo — Status

Fonte: `api/modules/status/status.cache.js`

Cache do status agregado (`platform` + `github.getStatus()` + `claude.getStatus()`).

---

## Exports

- `getCache()` — snapshot atual (`null` antes do primeiro warmup).
- `refresh()` — recalcula chamando os `getStatus()` dos módulos [github](github.md) e [claude](claude.md) em paralelo; atualiza o cache e retorna.
- `warmup()` — primeira carga, disparada no boot do servidor.
