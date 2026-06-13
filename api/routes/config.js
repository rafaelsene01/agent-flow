import settingsRoutes  from "./config/settings.js";
import worktreesRoutes from "./config/worktrees.js";
import runnerRoutes    from "./config/runner.js";
import tlcRoutes       from "./config/tlc.js";

export default function configRoutes(app) {
  settingsRoutes(app);
  worktreesRoutes(app);
  runnerRoutes(app);
  tlcRoutes(app);
}
