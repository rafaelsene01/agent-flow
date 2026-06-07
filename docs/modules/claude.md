# Módulo — Claude

Fonte: `api/modules/claude/`

Responsável por detectar disponibilidade do Claude CLI.

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `claude.service.js` | Detecção via CLI — exporta `getStatus()` |

---

## claude.service.js

### `getStatus()`

Executa `claude --version`. Sem fallback — CLI é o único método.

**Retorno:**
```js
{ connected: true,  method: "claude-cli", version: "1.x.x" }
{ connected: false }
```
