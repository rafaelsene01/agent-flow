#!/usr/bin/env node
import chalk from "chalk";
import { createRequire } from "module";
import { startServer } from "../api/server.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(version);
  process.exit(0);
}

const portFlagIdx = args.findIndex((a) => a === "-p" || a === "--port");
const port = Number.parseInt(portFlagIdx >= 0 ? args[portFlagIdx + 1] : "5522", 10);

// --host permite escolher o bind (ex.: 0.0.0.0 para expor na rede). Sem a flag,
// cai no env AGENT_FLOW_HOST e, por fim, localhost (só a própria máquina).
const hostFlagIdx = args.findIndex((a) => a === "--host");
const host = hostFlagIdx >= 0 ? args[hostFlagIdx + 1] : undefined;

try {
  const { url } = await startServer({ port, host });
  console.log(`\n  ${chalk.bold.cyan("Agent Flow")}`);
  console.log(`  ${chalk.green("►")} ${chalk.underline(url)}\n`);
} catch (err) {
  console.error(chalk.red("\n  Erro: " + err.message + "\n"));
  process.exit(1);
}
