# Rotas — /api/status

Fonte: `api/routes/status.js`

Status agregado (github + claude) vem do cache em [modules/status.md](../modules/status.md). Também instala skills no Claude global.

---

## GET /api/status

Retorna o cache; se o warmup ainda não terminou, faz a primeira leitura real.

```json
{
  "platform": "win32",
  "github": { "connected": true, "method": "gh-cli", "user": "rafaelsene01" },
  "claude": { "connected": true, "method": "claude-cli", "version": "1.x.x" }
}
```

## POST /api/status

Força `refresh()` do cache e retorna o status atualizado.

## POST /api/status/install-skill

Instala uma skill em `~/.claude/skills/<skill>`.

**Body:** `{ "skill": "nome", "force": false }` — default `tlc-spec-driven`. `force: true` remove a cópia global antes (atualizar).

Fontes, na ordem (via `INSTALLABLE_SKILLS` de `api/modules/skills/installable.js`):
- `type: "git"` → clone raso do repo e copia `subdir`
- `type: "local"` → copia de `<pacote>/.claude/skills/<skill>`
- fora do catálogo → copia do projeto (skills criadas pelo usuário)

Responde com o status atualizado (`refresh()`). Erros: `400` nome inválido, `404` skill não encontrada, `500` demais.
