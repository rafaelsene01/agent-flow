# Módulo — Config

Fonte: `api/modules/config/`

Persiste configuração global do app em `~/.agent-flow/config.json`.

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `config.service.js` | Leitura e escrita da config — exporta `getConfig()`, `setConfig()` |

---

## Localização

| Path | Descrição |
|------|-----------|
| `~/.agent-flow/config.json` | Arquivo de config |
| `~/.agent-flow/projects/` | Diretório de projetos (criado automaticamente) |

---

## Campos da config

| Campo | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `projectsPath` | `string` | `~/.agent-flow/projects` | Caminho base dos projetos |
| `boards` | `array` | `[]` | Boards salvos |
| `githubMethod` | `string` | — | Método de auth detectado: `"env"` ou `"gh-cli"` |

---

## config.service.js

### `getConfig()`

Lê `~/.agent-flow/config.json`. Retorna `DEFAULTS` merged com arquivo se existir. Sem erro se arquivo ausente.

### `setConfig(updates)`

Merge shallow de `updates` sobre config atual. Salva e retorna config resultante.

```js
setConfig({ projectsPath: "/home/user/projects" });
// retorna config completa atualizada
```
