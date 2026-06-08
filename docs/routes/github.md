# Rotas — /api/github

Fonte: `api/routes/github.js`

Delegam para `github.repos.js` e `github.boards.js`. Sem lógica própria.

---

## GET /api/github/repos

Lista repositórios do usuário autenticado.

**Resposta:**
```json
[
  {
    "name": "meu-repo",
    "fullName": "usuario/meu-repo",
    "private": false,
    "description": "Descrição",
    "updatedAt": "2024-01-01T00:00:00Z",
    "sshUrl": "git@github.com:usuario/meu-repo.git",
    "cloneUrl": "https://github.com/usuario/meu-repo"
  }
]
```

Retorna `[]` se sem auth. Ver [docs/modules/github.md](../modules/github.md#githubreposjs) para lógica de detecção.

**Erro:** `500 { "error": "mensagem" }`

---

## GET /api/github/boards

Lista GitHub Projects V2 (pessoais + organizações).

**Resposta:**
```json
[
  {
    "id": "PVT_xxx",
    "title": "Nome do Board",
    "number": 1,
    "url": "https://github.com/users/usuario/projects/1",
    "org": null,
    "repos": [
      { "name": "meu-repo", "fullName": "usuario/meu-repo", "cloneUrl": "https://github.com/usuario/meu-repo" }
    ]
  }
]
```

`org` é `null` para projetos pessoais, `"login-da-org"` para projetos de organização.

**Erro de escopo:** `500 { "error": "MISSING_SCOPE:read:project" }` — gh CLI não tem permissão `read:project`.

**Erro:** `500 { "error": "mensagem" }`
