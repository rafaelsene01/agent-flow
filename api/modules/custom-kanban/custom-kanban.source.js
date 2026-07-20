// SourceProvider "custom-kanban" — fonte de cards de um Kanban externo próprio.
// Isolado de propósito: cada source tem seus métodos próprios porque a criação
// de board (rotas/lógica) muda por tipo de source. Só é registrado quando há
// CUSTOM_KANBAN_TOKEN na env (ver providers.bootstrap.js).
// Contrato: ../sources/sources.contract.js · Regras: docs/providers.md.

import { request, getBaseUrl, getToken } from "./custom-kanban.client.js";

// Métodos do contrato ainda sem lógica definida — a montagem do board (boards,
// colunas, items, repos) será implementada por tipo de source. Falha explícita
// em vez de retorno vazio silencioso.
function notImplemented(method) {
  return () => {
    throw new Error(`CUSTOM_KANBAN_NOT_IMPLEMENTED:${method}`);
  };
}

export const customKanbanSource = {
  name: "custom-kanban",

  // Status via health-check: GET {CUSTOM_KANBAN_URL}/api/health com o token no
  // Authorization. Conectado quando responde 2xx. Sem env, reporta quais
  // variáveis configurar (o card da tela de Conexões renderiza error + commands).
  async getStatus() {
    const missing = [];
    if (!getBaseUrl()) missing.push("CUSTOM_KANBAN_URL");
    if (!getToken())   missing.push("CUSTOM_KANBAN_TOKEN");
    if (missing.length) {
      return {
        connected: false,
        method: "env",
        error: `Configure ${missing.join(" e ")} no ambiente e reinicie o servidor.`,
        commands: missing.map((v) => ({ label: v, cmd: `export ${v}=…` })),
      };
    }
    try {
      const res = await request("/api/health");
      if (!res.ok) {
        return { connected: false, method: "token", error: `Health check falhou (HTTP ${res.status})` };
      }
      return { connected: true, method: "token", name: "Custom Kanban" };
    } catch (err) {
      return { connected: false, method: "token", error: err.message };
    }
  },

  // Organizações do Custom Kanban (1º passo da montagem do board). Lê do serviço
  // externo em GET {baseURL}/api/organizations e normaliza para { id, name }.
  async listOrganizations() {
    const res = await request("/api/organizations");
    if (!res.ok) {
      throw new Error(`Falha ao listar organizações (HTTP ${res.status})`);
    }
    const data = await res.json();
    // O serviço externo devolve { data: [...] }; aceita também array cru ou
    // outras chaves comuns por robustez.
    const list = Array.isArray(data) ? data : (data?.data ?? data?.organizations ?? data?.items ?? []);
    return list.map((o) => ({
      id:   String(o.id ?? o.slug ?? o.name),
      name: o.name ?? o.title ?? o.slug ?? String(o.id),
    }));
  },

  // Projects de uma organização (2º passo). Lê de
  // GET {baseURL}/api/organizations/{organizationId}/projects e normaliza para { id, name }.
  async listProjects(organizationId) {
    const res = await request(`/api/organizations/${encodeURIComponent(organizationId)}/projects`);
    if (!res.ok) {
      throw new Error(`Falha ao listar projects (HTTP ${res.status})`);
    }
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data?.data ?? data?.projects ?? data?.items ?? []);
    return list.map((p) => ({
      id:   String(p.id ?? p.slug ?? p.name),
      name: p.name ?? p.title ?? p.slug ?? String(p.id),
    }));
  },

  // Boards de um project (3º passo). Lê de
  // GET {baseURL}/api/organizations/{organizationId}/projects/{projectId}/boards.
  async listProjectBoards(organizationId, projectId) {
    const res = await request(
      `/api/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/boards`
    );
    if (!res.ok) {
      throw new Error(`Falha ao listar boards (HTTP ${res.status})`);
    }
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data?.data ?? data?.boards ?? data?.items ?? []);
    return list.map((b) => ({
      id:   String(b.id ?? b.slug ?? b.name),
      name: b.name ?? b.title ?? b.slug ?? String(b.id),
    }));
  },

  // Colunas de um board (4º passo). Lê de
  // GET {baseURL}/api/organizations/{orgId}/projects/{projectId}/boards/{boardId}/columns.
  // Ordena por `order` e preserva a cor (headerColor) para colorir a coluna, como
  // no board do GitHub. Retorno normalizado: { id, name, color }.
  async listBoardColumns(organizationId, projectId, boardId) {
    const res = await request(
      `/api/organizations/${encodeURIComponent(organizationId)}` +
      `/projects/${encodeURIComponent(projectId)}` +
      `/boards/${encodeURIComponent(boardId)}/columns`
    );
    if (!res.ok) {
      throw new Error(`Falha ao listar colunas (HTTP ${res.status})`);
    }
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data?.data ?? data?.columns ?? data?.items ?? []);
    return [...list]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((c) => ({
        id:    String(c.id ?? c.name),
        name:  c.name ?? String(c.id),
        color: c.headerColor ?? c.color ?? null,
      }));
  },

  // Montagem do board — a implementar por tipo de source (ver comentário acima).
  listBoards: notImplemented("listBoards"),
  listColumns: notImplemented("listColumns"),
  listViews: notImplemented("listViews"),
  listItems: notImplemented("listItems"),
  listItemsByColumn: notImplemented("listItemsByColumn"),
  listColumnCounts: notImplemented("listColumnCounts"),
  listLinkableRepos: notImplemented("listLinkableRepos"),
  resolveRepoRef: notImplemented("resolveRepoRef"),
};
