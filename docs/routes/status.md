# Rotas — /api/status

Fonte: `api/routes/status.js`

Status agregado (github + claude) via [modules/status.md](../modules/status.md) — sem cache: cada GET revalida. Também instala skills no Claude global.

---

## GET /api/status

Revalida e retorna o status na hora (sem cache — erro transitório não fica congelado).

```json
{
  "platform": "win32",
  "github": { "connected": true, "method": "gh-cli", "user": "rafaelsene01" },
  "claude": { "connected": true, "method": "claude-cli", "version": "1.x.x" }
}
```

## POST /api/status

Mesmo `refresh()` do GET (mantido por compatibilidade — botão "revalidar" da UI).

## POST /api/status/install-skill

Instala uma skill em `~/.claude/skills/<skill>`.

**Body:** `{ "skill": "nome", "force": false }` — default `tlc-spec-driven`. `force: true` remove a cópia global antes (atualizar).

Fontes, na ordem (via `INSTALLABLE_SKILLS` de `api/modules/skills/installable.js`):
- `type: "git"` → clone raso do repo e copia `subdir`
- `type: "local"` → copia de `<pacote>/.claude/skills/<skill>`
- fora do catálogo → copia do projeto (skills criadas pelo usuário)

Responde com o status atualizado (`refresh()`). Erros: `400` nome inválido, `404` skill não encontrada, `500` demais.
