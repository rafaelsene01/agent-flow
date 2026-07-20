import { validateToken, getToken, clearTokenCache } from "./github.client.js";
import { setConfig } from "../config/config.service.js";

// Comando de instalação do gh CLI por plataforma. Fica no provider (não no
// frontend) para manter a UI neutra — a tela de Conexões só renderiza o que o
// provider reporta em status.commands quando desconectado. Ver docs/providers.md.
const GH_INSTALL = {
  win32:  { label: "Instalar (winget)",   cmd: "winget install --id GitHub.cli" },
  darwin: { label: "Instalar (Homebrew)", cmd: "brew install gh" },
  linux:  { label: "Instalar (apt)",      cmd: "sudo apt install gh" },
};

// Passos para conectar quando desconectado: instalar o gh e autenticar com o
// escopo read:project.
function connectCommands() {
  const install = GH_INSTALL[process.platform] ?? GH_INSTALL.linux;
  return [install, { label: "Autenticar", cmd: "gh auth login -s read:project" }];
}

export async function getStatus() {
  clearTokenCache();
  const token = getToken();

  if (!token) {
    return {
      connected: false,
      error: "gh CLI não autenticado. Execute 'gh auth login -s read:project' ou configure GH_TOKEN.",
      commands: connectCommands(),
    };
  }

  try {
    const user = await validateToken(token);
    setConfig({ githubMethod: "env" });
    return { connected: true, method: "token", user: user.login, name: user.name };
  } catch (err) {
    return { connected: false, error: err.message, commands: connectCommands() };
  }
}
