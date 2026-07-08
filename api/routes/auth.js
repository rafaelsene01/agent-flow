import { isAuthRequired, verifyPassword, getAuthHash } from "../modules/auth/auth.service.js";
import { sendError } from "../lib/errors.js";

export default function authRoutes(app) {
  // Diz ao front se há senha configurada (sem exigir estar autenticado).
  app.get("/api/auth/status", (_req, res) => {
    res.json({ required: isAuthRequired() });
  });

  // Recebe a senha em texto puro, valida contra o hash salvo e devolve o token
  // (o próprio hash) para o front guardar no cookie e reenviar no header.
  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body ?? {};
    if (typeof password !== "string" || !password) {
      return sendError(res, 400, "Senha obrigatória");
    }
    if (!verifyPassword(password)) {
      return sendError(res, 401, "Senha incorreta");
    }
    res.json({ token: getAuthHash() });
  });
}
