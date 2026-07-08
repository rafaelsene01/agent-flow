# Providers — Source (cards) + Repo (código)

> **Leia antes de mexer em board, item, coluna, repo, branch ou worktree.**
> O app é multi-provider por design. GitHub é a única implementação hoje, mas o
> código é estruturado para plugar outros **sem tocar no núcleo nem no frontend**.
> Quebrar essas regras re-acopla tudo ao GitHub e derruba a abstração.

## Dois eixos ortogonais

| Eixo | O quê | Contrato | Implementado | Futuro |
|------|-------|----------|--------------|--------|
| **Source** | de onde vêm os cards (boards, colunas, items, views) | `SourceProvider` | `github-board` | `linear`, ... |
| **Repo** | onde vive o código (repos, branches, clone) | `RepoProvider` | `github` | `bitbucket`, ... |

Source e Repo são **independentes**. Um board declara seu `source` **e** vincula
um ou mais `repos` (cada um com seu `host`). Um board Linear pode apontar para um
repo GitHub. O vínculo mora na config do board, não é derivado implicitamente.

## Onde fica cada coisa

```
api/modules/
  sources/
    sources.registry.js   register/get/list — puro, sem deps
    sources.contract.js   typedefs do SourceProvider + Card normalizado
  repos/
    repos.registry.js
    repos.contract.js
  github/                 client REST/GraphQL + token (plumbing compartilhado)
    github.source.js      monta o SourceProvider "github-board"
    github.repo.js        monta o RepoProvider "github"
  providers.bootstrap.js  registra github nos 2 registries (único ponto que nomeia "github")
api/routes/
  sources.js              /api/sources/*
  repos.js                /api/repos/*
web/lib/api/
  sources.js, repos.js    client neutro do frontend
```

## Contrato SourceProvider

```js
{ name, getStatus, listBoards, listColumns, listViews,
  listItems, listItemsByColumn, listColumnCounts,
  listLinkableRepos, resolveRepoRef }
```

- **Card normalizado** (única saída permitida p/ fora do provider):
  `{ id, type, itemType, title, number, body, assignees, labels, columnId, columnName }`.
- **`resolveRepoRef(card, board)` → `{ host, owner, repo, defaultBranch? }`** é o
  **único** lugar autorizado a decidir em qual repo o card abre worktree. github lê
  `owner/repo` do próprio item; sources sem repo no card resolvem via `board.repos`.

## Contrato RepoProvider

```js
{ name, getStatus, listRepos, listBranches, createBranch,
  getCloneUrl, repoRefId }
```

- **`getCloneUrl({owner,repo})`** encapsula host + auth (github: `x-access-token@github.com`).
  Todo o resto de git (`git.worktree.js`) é git puro e **host-agnóstico** — a clone URL
  entra **injetada** pelo caller. O módulo `git` **não importa** provider nenhum.

## Config (back-compat)

```js
board = { id, source:"github-board", repos:[{host:"github",owner,repo}], ... }
worktree = { ..., host:"github" }   // id prefixa host só quando ≠ github
```

Leitura sempre aplica default github quando o campo novo falta:
`board.source ?? "github-board"`, `host ?? "github"`. `config.githubMethod` continua válido.
**Não** migrar `config.json` em disco — só ler o formato antigo com defaults.

## Regras duras (NÃO violar em melhorias futuras)

1. **Nenhuma chamada a `github.com`, `gh`, `graphQL`, `getToken` fora de `api/modules/github/`.**
   Precisa de dado do GitHub? Vai pelo contrato do provider.
2. **Proibido `if (provider === "github")` / `if (host === "github")` espalhado.** Discriminação
   de provider só via `sourceRegistry.get(...)` / `repoRegistry.get(...)`. O único ponto que
   nomeia "github" é `providers.bootstrap.js`.
3. **Frontend nunca chama `/api/github/*`** nem usa a string `github` como discriminador.
   Só o client neutro `web/lib/api/`. Manter `grep -r "/api/github" web/` = **0**.
4. **Card normalizado é o contrato.** Não vazar campos crus do GitHub (nós GraphQL, `content`,
   `fieldValues`) para rota, frontend ou agent-runs. Normalizar dentro do provider.
5. **Vínculo card→repo só via `resolveRepoRef`.** Não voltar a ler `owner/repo` do item em
   outro lugar. `board.source` + `board.repos` são a fonte de verdade.
6. **git puro fica em `modules/git`, sem provider.** Host/clone URL entram por parâmetro.
7. **Adicionar provider = 1 pasta + 1 linha no bootstrap.** Se precisar editar rota, frontend
   ou núcleo p/ adicionar um provider, a abstração vazou — corrigir a abstração, não remendar.
8. **Novo método no contrato** ⇒ atualizar `*.contract.js` **e** este doc **e** todas as
   implementações. Contrato e implementações não divergem.

## Ao adicionar um provider novo (ex: linear, bitbucket)

1. `api/modules/<provider>/<provider>.source.js` (ou `.repo.js`) implementando o contrato.
2. Registrar em `providers.bootstrap.js` (1 linha).
3. Se o source não carrega repo no card: implementar `resolveRepoRef` via `board.repos`.
4. Auth própria dentro do módulo do provider (não reusar github).
5. Zero edição em `routes/`, `web/`, `git/` ou nos registries.
