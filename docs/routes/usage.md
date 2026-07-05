# Rotas — /api/usage e /api/usage-stats

Dois domínios que não se misturam:

- `/api/usage` (`api/routes/usage.js`) — **limites do plano** Claude (badge da sidebar).
- `/api/usage-stats` (`api/routes/usage-stats.js`) — **estatísticas de execução** dos agentes (tela `/usage`), store em [modules/usage.md](../modules/usage.md).

---

## GET /api/usage

Utilização dos rate limits do plano. Implementação: request mínimo (1 token, haiku) à API Anthropic com o token OAuth de `~/.claude/.credentials.json`; lê os headers `anthropic-ratelimit-unified-5h/7d-*`.

```json
{
  "session": { "pct": 42, "reset": "3:05 PM" },
  "weekly":  { "pct": 10, "reset": "Jul 8, 9:00 AM" }
}
```

Cache em memória, refresh a cada 5 min. `503` se nunca conseguiu dados.

## GET /api/usage-stats

Registros de execução: `{ records }`. Filtros: `?repo=` e `?days=` (número > 0).

## DELETE /api/usage-stats

Limpa os registros → `{ ok, removed }`.
