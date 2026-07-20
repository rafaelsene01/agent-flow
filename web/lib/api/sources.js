// Client neutro de Source (fonte de cards). Único ponto do frontend que conhece
// os endpoints de sources. Nenhum componente referencia o namespace github antigo
// nem a string do provider. Ver docs/providers.md.

// Source default para discovery de boards enquanto só existe o github-board.
export const DEFAULT_SOURCE = "github-board";

// Source do Kanban customizado. Centraliza a string num único ponto do frontend
// para os fluxos de discovery próprios dele (ex.: seleção de organização).
export const CUSTOM_KANBAN_SOURCE = "custom-kanban";

const qsuffix = (qs) => (qs ? `?${qs}` : "");
const json = (r) => r.json();
const enc = encodeURIComponent;

// Providers de source registrados + status de cada um (tela de Conexões).
// [{ source, status: { connected, method, user, name, error?, commands? } }]
// Servido do cache SWR do backend; `refresh:true` (=> ?refresh=1) revalida.
export function status({ refresh = false } = {}) {
  return fetch(`/api/sources${refresh ? "?refresh=1" : ""}`).then(json);
}

// Organizações conectáveis de um source (discovery). Vazio quando o source não
// agrupa boards por organização.
export function organizations(source = DEFAULT_SOURCE) {
  return fetch(`/api/sources/${source}/organizations`).then(json);
}

// Projects de uma organização (discovery). Vazio quando o source não tem projects.
export function projects(source, organizationId) {
  return fetch(`/api/sources/${source}/organizations/${enc(organizationId)}/projects`).then(json);
}

// Boards de um project (discovery). Vazio quando o source não tem essa cadeia.
export function projectBoards(source, organizationId, projectId) {
  return fetch(`/api/sources/${source}/organizations/${enc(organizationId)}/projects/${enc(projectId)}/boards`).then(json);
}

// Colunas de um board (discovery). Cada coluna traz `color` p/ colorir. Vazio
// quando o source não tem essa cadeia.
export function boardColumns(source, organizationId, projectId, boardId) {
  return fetch(`/api/sources/${source}/organizations/${enc(organizationId)}/projects/${enc(projectId)}/boards/${enc(boardId)}/columns`).then(json);
}

// Boards conectáveis de um source (discovery). `qs` aceita string ou URLSearchParams.
export function boards(source = DEFAULT_SOURCE) {
  return fetch(`/api/sources/${source}/boards`).then(json);
}

export function items(boardId, qs) {
  return fetch(`/api/sources/${enc(boardId)}/items${qsuffix(qs)}`).then(json);
}

export function columnCounts(boardId, qs) {
  return fetch(`/api/sources/${enc(boardId)}/column-counts${qsuffix(qs)}`).then(json);
}

export function columns(boardId) {
  return fetch(`/api/sources/${enc(boardId)}/columns`).then(json);
}

export function views(boardId) {
  return fetch(`/api/sources/${enc(boardId)}/views`).then(json);
}

// Repos que o source sugere vincular ao board.
export function linkableRepos(boardId) {
  return fetch(`/api/sources/${enc(boardId)}/repos`).then(json);
}
