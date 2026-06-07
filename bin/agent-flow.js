#!/usr/bin/env node
import chalk from "chalk";
import ora from "ora";
import { readConfig, getConfigPath } from "../api/config.js";
import { startServer } from "../api/server.js";

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log("1.0.0");
  process.exit(0);
}

const portFlagIdx = args.findIndex((a) => a === "-p" || a === "--port");
const port = Number.parseInt(portFlagIdx >= 0 ? args[portFlagIdx + 1] : "5522", 10);

const config     = readConfig();
const configPath = getConfigPath();

try {
  const spinner = ora("Iniciando Agent Flow…").start();
  const { url } = await startServer({ config, port, configPath });
  spinner.stop();
  console.log(`\n  ${chalk.bold.cyan("Agent Flow Board")}`);
  console.log(`  ${chalk.green("►")} ${chalk.underline(url)}\n`);
} catch (err) {
  console.error(chalk.red("\n  Erro: " + err.message + "\n"));
  process.exit(1);
}
