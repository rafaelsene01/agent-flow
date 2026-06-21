import { execSync } from "child_process";
import { rmSync, cpSync, mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { rolldown } from "rolldown";

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

console.log("► Bundlando api + bin (rolldown)");
const bundle = await rolldown({
  input: path.join(ROOT, "bin", "agent-flow.js"),
  platform: "node",
});

await bundle.write({
  file: OUTFILE,
  format: "esm",
});

let code = readFileSync(OUTFILE, "utf8");
code = code.replaceAll("process.env.AGENT_FLOW_BUNDLED", '"1"');
writeFileSync(OUTFILE, code);
chmodSync(OUTFILE, 0o755);

console.log("► Copiando web/out → dist/web");
cpSync(path.join(ROOT, "web", "out"), path.join(DIST, "web"), { recursive: true });

if (!existsSync(path.join(DIST, "web", "index.html"))) {
  console.error("✖ dist/web/index.html não encontrado — build da web falhou?");
  process.exit(1);
}

console.log("✔ Build final em dist/ pronto. Rode com: node dist/agent-flow.js");
