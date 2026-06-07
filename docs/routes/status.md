# Rota — /api/status

Fonte: `api/routes/status.js`

Verifica conectividade do GitHub e do Claude. Chamada pelo frontend ao carregar para decidir se exibe o modal de configurações.

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

---

## Detecção do GitHub — ordem de prioridade

1. **Token de ambiente** — `GH_TOKEN` | `GITHUB_TOKEN` | `GITHUB_KEY` → valida via `GET /user`
2. **gh CLI** — `gh api user` → parse JSON para login
3. **SSH** — `ssh -T git@github.com` → busca `Hi <usuário>!` em stdout+stderr
4. **git ls-remote** — fallback SSH via stack SSH nativo do git (mais confiável no Windows)

Cada etapa passa adiante em caso de falha. Retorna `{ connected: false }` só se todas falharem.

Valores de `method`: `"env"` | `"gh-cli"` | `"ssh"`

---

## Detecção do Claude

Único método: `claude --version` via CLI.

Retorna `{ connected: true, method: "claude-cli", version: "..." }` em caso de sucesso, `{ connected: false }` se CLI não encontrado.
