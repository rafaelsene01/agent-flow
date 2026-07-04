import settingsRoutes  from "./config/settings.js";
import worktreesRoutes from "./config/worktrees.js";
import runnerRoutes    from "./config/runner.js";
import overlayRoutes   from "./config/overlay.js";

export default function configRoutes(app) {
  settingsRoutes(app);
  worktreesRoutes(app);
  runnerRoutes(app);
  overlayRoutes(app);
}
