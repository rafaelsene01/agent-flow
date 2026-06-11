import { execSync } from "child_process";
import { rmSync, cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import esbuild from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OUTFILE = path.join(DIST, "agent-flow.js");

console.log("► Limpando dist/");
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

console.log("► Buildando web (next build)");
execSync("npm run build", {
  cwd: path.join(ROOT, "web"),
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});

console.log("► Bundlando api + bin (esbuild)");
await esbuild.build({
  entryPoints: [path.join(ROOT, "bin", "agent-flow.js")],
  outfile: OUTFILE,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  packages: "external",
  define: { "process.env.AGENT_FLOW_BUNDLED": '"1"' },
});

console.log("► Ofuscando bundle da api");
let code = readFileSync(OUTFILE, "utf8");
let shebang = "";
if (code.startsWith("#!")) {
  const nl = code.indexOf("\n") + 1;
  shebang = code.slice(0, nl);
  code = code.slice(nl);
}
const obfuscated = JavaScriptObfuscator.obfuscate(code, {
  target: "node",
  compact: true,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  selfDefending: false,
  deadCodeInjection: false,
  controlFlowFlattening: false,
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ["base64"],
}).getObfuscatedCode();
writeFileSync(OUTFILE, shebang + obfuscated);

console.log("► Copiando web/out → dist/web");
cpSync(path.join(ROOT, "web", "out"), path.join(DIST, "web"), { recursive: true });

if (!existsSync(path.join(DIST, "web", "index.html"))) {
  console.error("✖ dist/web/index.html não encontrado — build da web falhou?");
  process.exit(1);
}

console.log("✔ Build final em dist/ pronto. Rode com: node dist/agent-flow.js");
