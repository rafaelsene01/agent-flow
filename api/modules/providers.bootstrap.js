// Bootstrap de providers — ÚNICO ponto que nomeia "github" por composição.
// Importa as implementações github e as registra nos dois registries. Chamado no
// boot (server.js) antes de montar rotas. Ver docs/providers.md.

import { register as registerSource } from "./sources/sources.registry.js";
import { register as registerRepo } from "./repos/repos.registry.js";
import { githubSource } from "./github/github.source.js";
import { githubRepo } from "./github/github.repo.js";
import { customKanbanSource } from "./custom-kanban/custom-kanban.source.js";

export function registerProviders() {
  registerSource(githubSource.name, githubSource);
  registerRepo(githubRepo.name, githubRepo);

  // Custom Kanban é sempre registrado para aparecer na tela de Conexões mesmo
  // sem env — aí o card mostra quais variáveis configurar (getStatus reporta as
  // faltantes). Como o InitBoardModal só oferece sources `connected`, ele não
  // polui a criação de board enquanto CUSTOM_KANBAN_URL/_TOKEN não estiverem no
  // ambiente. Ver docs/providers.md.
  registerSource(customKanbanSource.name, customKanbanSource);
}
