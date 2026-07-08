// Contrato SourceProvider (fonte de cards) — doc executável via JSDoc typedefs.
// Nenhuma lógica: descreve o shape que todo source (github-board, futuro linear, ...)
// deve satisfazer. A implementação github vive em api/modules/github/github.source.js.
// Regras duras em docs/providers.md.

/**
 * Card normalizado — contrato de saída consumido pela UI e pelo agent-runs (REQ-7).
 * Nenhum campo cru específico de um source vaza para fora do provider.
 * @typedef {Object} Card
 * @property {string} id                  identidade do item no source
 * @property {"Issue"|"PullRequest"|"DraftIssue"} type  tipo normalizado do item
 * @property {string} [itemType]          rótulo secundário do source (livre)
 * @property {string} title
 * @property {number} [number]            número do item (quando o source tem)
 * @property {string} [body]
 * @property {Array<{login?:string,name?:string}>} [assignees]
 * @property {string[]} [labels]
 * @property {string} columnId
 * @property {string} columnName
 */

/**
 * Referência de repo resolvida a partir de um Card (REQ-6).
 * É o ponto que desacopla card de repo.
 * @typedef {Object} RepoRef
 * @property {string} host                host do RepoProvider (ex.: "github")
 * @property {string} owner
 * @property {string} repo
 * @property {string} [defaultBranch]
 */

/**
 * @typedef {Object} SourceStatus
 * @property {boolean} connected
 * @property {string} [method]
 * @property {string} [user]
 * @property {string} [name]
 * @property {string} [error]
 */

/**
 * SourceProvider — fonte de cards.
 * @typedef {Object} SourceProvider
 * @property {string} name                                       identificador (ex.: "github-board")
 * @property {() => (SourceStatus|Promise<SourceStatus>)} getStatus
 * @property {() => Promise<Array<{id:string,name:string}>>} listBoards        boards conectáveis
 * @property {(boardId:string) => Promise<Array<{id:string,name:string,color?:string}>>} listColumns
 * @property {(boardId:string) => Promise<Array<{id:string,name:string,number?:number}>>} listViews
 * @property {(boardId:string, opts?:object) => Promise<{items:Card[],nextCursor?:string}>} listItems
 * @property {(boardId:string, columnId:string, opts?:object) => Promise<{items:Card[],nextCursor?:string}>} listItemsByColumn
 * @property {(boardId:string, opts?:object) => Promise<Record<string,number>>} listColumnCounts
 * @property {(boardId:string) => Promise<Array<{host:string,owner:string,repo:string}>>} listLinkableRepos  repos que o source sugere vincular
 * @property {(card:Card, board:object) => (RepoRef|Promise<RepoRef>)} resolveRepoRef   Card → RepoRef
 * @property {(boardId:string) => Promise<any>} [warm]                          opcional: aquece cache do board
 * @property {(boardId:string) => any} [startPolling]                           opcional: inicia polling do board
 */

export {};
