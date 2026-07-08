// RepoProvider "github" — monta o objeto-contrato reusando repos/branches/client.
// Concentra o que é host-específico do git.worktree.js: montagem da clone URL
// autenticada (x-access-token@github.com). Contrato: ../repos/repos.contract.js.

import { getToken } from "./github.client.js";
import { getStatus } from "./github.service.js";
import { listRepos } from "./github.repos.js";
import { listBranches, createBranch } from "./github.branches.js";

export const githubRepo = {
  name: "github",

  getStatus,
  listRepos,
  listBranches,
  createBranch,

  // URL autenticada p/ git clone. Encapsula github.com + x-access-token — o único
  // ponto que outro host (bitbucket) trocaria. Move a lógica de git.worktree.js.
  getCloneUrl({ owner, repo }) {
    const token = getToken();
    return token
      ? `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
      : `https://github.com/${owner}/${repo}.git`;
  },

  repoRefId({ owner, repo }) {
    return `${owner}/${repo}`;
  },
};
