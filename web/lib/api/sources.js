// Client neutro de Source (fonte de cards). Único ponto do frontend que conhece
// os endpoints de sources. Nenhum componente referencia o namespace github antigo
// nem a string do provider. Ver docs/providers.md.

// Source default para discovery de boards enquanto só existe o github-board.
export const DEFAULT_SOURCE = "github-board";

const qsuffix = (qs) => (qs ? `?${qs}` : "");
const json = (r) => r.json();
const enc = encodeURIComponent;

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
