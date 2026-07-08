import { execSync } from "child_process";
import { getConfig, setConfig } from "../../modules/config/config.service.js";
import { hashPassword } from "../../modules/auth/auth.service.js";
import { sendError } from "../../lib/errors.js";

const BROWSE_CMD = {
  win32:  `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"`,
  darwin: `osascript -e 'POSIX path of (choose folder)'`,
  linux:  `zenity --file-selection --directory 2>/dev/null || kdialog --getexistingdirectory 2>/dev/null`,
};

// Nunca devolve o hash da senha ao cliente (é o próprio token). Expõe só o
// booleano `authEnabled`; o front mostra a senha ofuscada a partir dele.
function redactConfig(cfg) {
  const { authHash, ...rest } = cfg;
  return { ...rest, authEnabled: typeof authHash === "string" && authHash.length > 0 };
}

export default function settingsRoutes(app) {
  app.get("/api/config", (_req, res) => {
    res.json(redactConfig(getConfig()));
  });

  app.post("/api/config", (req, res) => {
    // `authHash` nunca vem do cliente (só o backend gera). `authPassword` é a senha
    // em texto puro: string vazia limpa a senha, não-vazia gera o hash.
    const { boards } = req.body ?? {};
    if (boards !== undefined && !Array.isArray(boards)) {
      return sendError(res, 400, "boards deve ser array");
    }
    const { authPassword, authHash: _ignore, ...patch } = req.body ?? {};
    if (authPassword !== undefined) {
      patch.authHash = authPassword === "" ? null : hashPassword(authPassword);
    }
    try {
      const updated = setConfig(patch);
      res.json(redactConfig(updated));
    } catch (err) {
      sendError(res, 500, err.message, err);
    }
  });

  app.post("/api/config/browse", (_req, res) => {
    const cmd = BROWSE_CMD[process.platform];
    if (!cmd) return sendError(res, 400, "Plataforma não suportada");
    try {
      const selected = execSync(cmd, { encoding: "utf-8", timeout: 30000 }).trim();
      if (!selected) return res.status(204).end();
      res.json({ path: selected });
    } catch {
      res.status(204).end();
    }
  });
}
