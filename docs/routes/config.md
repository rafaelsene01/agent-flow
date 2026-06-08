# Rotas — /api/config

Fonte: `api/routes/config.js`

Leitura e escrita da config global. Usa `getConfig()` / `setConfig()` de `api/modules/config/config.service.js`.

---

## GET /api/config

Retorna config atual.

**Resposta:**
```json
{
  "projectsPath": "/home/user/.agent-flow/projects",
  "boards": [],
  "githubMethod": "gh-cli"
}
```

---

## POST /api/config

Merge shallow de campos enviados sobre config atual. Salva e retorna config resultante.

**Body:** objeto com campos a atualizar (parcial OK).

```json
{ "projectsPath": "/home/user/meus-projetos" }
```

**Resposta:** config completa atualizada.

**Erro:** `500 { "error": "mensagem" }`

---

## POST /api/config/browse

Abre seletor nativo de pasta do SO. Retorna caminho selecionado.

| Plataforma | Comando usado |
|------------|---------------|
| `win32` | `FolderBrowserDialog` via PowerShell |
| `darwin` | `osascript choose folder` |
| `linux` | `zenity` → fallback `kdialog` |

**Resposta (200):** `{ "path": "/caminho/selecionado" }`

**Sem seleção (204):** body vazio (usuário cancelou).

**Plataforma não suportada (400):** `{ "error": "Plataforma não suportada" }`
