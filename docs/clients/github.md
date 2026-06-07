# Cliente — GitHub

Fonte: `api/clients/github.js`

Cliente HTTP bruto para GitHub REST API v2022-11-28. Todas requisições usam autenticação `Bearer`.

---

## Funções

### `validateToken(token)`

`GET /user` — verifica se token é válido. Retorna objeto do usuário em caso de sucesso, lança exceção em 401/403.

```js
const user = await validateToken("ghp_xxx");
// { login: "joseComilão01", name: "Comilão", ... }
```

### `getRepositories(token)`

`GET /user/repos?per_page=100&sort=updated` — retorna repositórios do usuário ordenados por última atualização.

---

## Formato de erro

Todas as falhas lançam `Error` com mensagem: `"GitHub API error <status>: <body>"`
