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

try {
  const { url } = await startServer({ port });
  console.log(`\n  ${chalk.bold.cyan("Agent Flow")}`);
  console.log(`  ${chalk.green("►")} ${chalk.underline(url)}\n`);
} catch (err) {
  console.error(chalk.red("\n  Erro: " + err.message + "\n"));
  process.exit(1);
}
