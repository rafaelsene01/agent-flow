# Rota — /api/status

Fonte: `api/routes/status.js`

Agregador — chama `getStatus()` dos módulos `github` e `claude` em paralelo e retorna resultado unificado. Sem lógica de detecção própria.

---

## GET /api/status

**Resposta**
```json
{
  "platform": "win32",
  "github": {
    "connected": true,
    "method": "ssh",
    "user": "rafaelsene01"
  },
  "claude": {
    "connected": true,
    "method": "claude-cli",
    "version": "1.x.x"
  }
}
```

**Dependências:**

| Módulo | Doc |
|--------|-----|
| GitHub | [docs/modules/github.md](../modules/github.md) |
| Claude | [docs/modules/claude.md](../modules/claude.md) |
