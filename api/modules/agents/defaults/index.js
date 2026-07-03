// Agentes default que acompanham o app. Ficam nesta pasta como um .json por
// agente. Para adicionar um novo default: crie o arquivo <slug>.json aqui e
// registre-o no mapa FILES abaixo — o id é derivado do slug (default:<slug>).
//
// Usamos imports estáticos (não readdir) para que o rolldown inline os JSON no
// bundle final; readdir em runtime não enxergaria os arquivos dentro do dist/.
import codeReviewer from "./code-reviewer.json" with { type: "json" };
import featurePlanner from "./feature-planner.json" with { type: "json" };
import implementer from "./implementer.json" with { type: "json" };
import commitPush from "./commit-push.json" with { type: "json" };
import createPr from "./create-pr.json" with { type: "json" };
import developer from "./developer.json" with { type: "json" };

const FILES = {
  developer,
  "feature-planner": featurePlanner,
  implementer,
  "code-reviewer": codeReviewer,
  "commit-push": commitPush,
  "create-pr": createPr,
};

// Cada default vira um agent completo com id estável e a flag isDefault, que
// bloqueia edição/exclusão no serviço e esconde os botões na UI. A flag opcional
// allowGit (ex.: Commit & Push) libera o agente a rodar git no runner; a flag
// skipWorktreeCheck (ex.: Feature Planner, Code Reviewer) marca agentes que gravam
// fora da worktree (pasta helpers) e portanto não exigem mudanças na árvore.
export const DEFAULT_AGENTS = Object.entries(FILES).map(([slug, data]) => ({
  id: `default:${slug}`,
  ...data,
  skills: Array.isArray(data.skills) ? data.skills : [],
  allowGit: !!data.allowGit,
  skipWorktreeCheck: !!data.skipWorktreeCheck,
  isDefault: true,
}));

// True se o id pertence a um agent default (não pode ser editado nem excluído).
export function isDefaultAgentId(id) {
  return typeof id === "string" && id.startsWith("default:");
}
