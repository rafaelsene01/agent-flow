import { getUpdateInfo, requestUpdate } from "../modules/update/update.service.js";
import { sendError } from "../lib/errors.js";

export default function updateRoutes(app) {
  app.get("/api/update", async (_req, res) => {
    try {
      res.json(await getUpdateInfo());
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  // Autoriza a atualização: grava a flag que o daemon observa. A confirmação
  // (inclusive o aviso de runs ativos que serão mortos) acontece na UI.
  app.post("/api/update", async (_req, res) => {
    try {
      res.json(await requestUpdate());
    } catch (err) {
      sendError(res, err.statusCode ?? 500, err.message, err);
    }
  });
}
