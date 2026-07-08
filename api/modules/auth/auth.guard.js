import { getAuthHash, verifyToken } from "./auth.service.js";

export const AUTH_HEADER = "x-agent-flow-auth";
export const AUTH_QS     = "_auth";

// Rotas liberadas mesmo com senha ativa — sem elas o front não conseguiria
// descobrir que precisa de senha nem fazer login.
const OPEN_PATHS = ["/api/auth/status", "/api/auth/login"];

// Leitura de status/config é sempre livre: o app precisa dela pra bootar (saber se
// GitHub/Claude estão OK) e decidir mostrar o modal de senha — se fosse protegida,
// o boot recebia 401 e abria a tela de Settings no lugar. Só a ESCRITA (salvar
// path/boards/senha…) exige estar logado. Conteúdo do site (boards, agents, runs,
// usage…) segue protegido — é o que dispara o modal.
function isOpen(req) {
  if (OPEN_PATHS.includes(req.path)) return true;
  if (req.path === "/api/status") return true; // GET + POST (recheck, read-only)
  if (req.method === "GET" && (req.path === "/api/config" || req.path.startsWith("/api/config/"))) {
    return true;
  }
  return false;
}

// Guarda o namespace /api quando há senha configurada. Assets/HTML do front passam
// livres (senão o modal de senha nem carregaria). Token vem no header ou, para SSE
// (EventSource não manda header), no query param ?_auth=.
export function authGuard(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  if (isOpen(req)) return next();
  if (!getAuthHash()) return next();

  const token = req.get(AUTH_HEADER) || req.query[AUTH_QS];
  if (verifyToken(token)) return next();
  return res.status(401).json({ error: "Unauthorized" });
}
