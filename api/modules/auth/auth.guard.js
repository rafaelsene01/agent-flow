import { getAuthHash, verifyToken } from "./auth.service.js";

export const AUTH_HEADER = "x-agent-flow-auth";
export const AUTH_QS     = "_auth";

// Rotas liberadas mesmo com senha ativa — sem elas o front não conseguiria
// descobrir que precisa de senha nem fazer login.
const OPEN_PATHS = ["/api/auth/status", "/api/auth/login"];

// Guarda todo o namespace /api quando há senha configurada. Assets/HTML do front
// passam livres (senão o modal de senha nem carregaria). Token vem no header ou,
// para SSE (EventSource não manda header), no query param ?_auth=.
export function authGuard(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  if (OPEN_PATHS.includes(req.path)) return next();
  if (!getAuthHash()) return next();

  const token = req.get(AUTH_HEADER) || req.query[AUTH_QS];
  if (verifyToken(token)) return next();
  return res.status(401).json({ error: "Unauthorized" });
}
