// Bootstrap de providers — ÚNICO ponto que nomeia "github" por composição.
// Importa as implementações github e as registra nos dois registries. Chamado no
// boot (server.js) antes de montar rotas. Ver docs/providers.md.

import { register as registerSource } from "./sources/sources.registry.js";
import { register as registerRepo } from "./repos/repos.registry.js";
import { githubSource } from "./github/github.source.js";
import { githubRepo } from "./github/github.repo.js";

export function registerProviders() {
  registerSource(githubSource.name, githubSource);
  registerRepo(githubRepo.name, githubRepo);
}
