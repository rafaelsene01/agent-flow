// Contrato RepoProvider (host de código) — doc executável via JSDoc typedefs.
// Nenhuma lógica: descreve o shape que todo host (github, futuro bitbucket, ...)
// deve satisfazer. A implementação github vive em api/modules/github/github.repo.js.
// Regras duras em docs/providers.md.

/**
 * @typedef {Object} RepoStatus
 * @property {boolean} connected
 * @property {string} [method]
 * @property {string} [user]
 * @property {string} [error]
 */

/**
 * @typedef {Object} RepoRef
 * @property {string} owner
 * @property {string} repo
 */

/**
 * RepoProvider — host de código.
 * @typedef {Object} RepoProvider
 * @property {string} name                                       identificador do host (ex.: "github")
 * @property {() => (RepoStatus|Promise<RepoStatus>)} getStatus
 * @property {() => Promise<Array<{owner:string,repo:string}>>} listRepos
 * @property {(owner:string, repo:string, query?:string) => Promise<string[]>} listBranches
 * @property {(owner:string, repo:string, newBranch:string, originBranch:string) => Promise<any>} createBranch
 * @property {(ref:RepoRef) => (string|Promise<string>)} getCloneUrl          URL autenticada p/ git clone (host-específica)
 * @property {(ref:RepoRef) => string} repoRefId                              string de identidade ("owner/repo")
 */

export {};
