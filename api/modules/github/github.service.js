import { validateToken, getToken, clearTokenCache } from "./github.client.js";
import { setConfig } from "../config/config.service.js";

export async function getStatus() {
  clearTokenCache();
  const token = getToken();

  if (!token) {
    return { connected: false, error: "gh CLI não autenticado. Execute 'gh auth login' ou configure GH_TOKEN." };
  }

  try {
    const user = await validateToken(token);
    setConfig({ githubMethod: "env" });
    return { connected: true, method: "token", user: user.login, name: user.name };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}
