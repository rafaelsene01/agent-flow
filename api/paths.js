import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Substituído em build-time pelo esbuild (--define) no bundle final em dist/.
export const IS_BUNDLED = process.env.AGENT_FLOW_BUNDLED === "1";

// Em dev este arquivo vive em api/, então ".." é a raiz do repo.
// No bundle o arquivo final vive em dist/, então ".." é a raiz do pacote instalado.
export const PACKAGE_ROOT = path.resolve(__dirname, "..");

// Em dev a web buildada fica em web/out; no bundle ela é copiada para dist/web.
export const WEB_DIST_DIR = IS_BUNDLED
  ? path.join(__dirname, "web")
  : path.join(PACKAGE_ROOT, "web", "out");
