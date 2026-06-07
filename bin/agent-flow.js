#!/usr/bin/env node
import chalk from "chalk";
import ora from "ora";
import { readConfig, getConfigPath } from "../src/config.js";
import * as linear from "../src/sources/linear.js";
import { startBoardServer } from "../src/server/board-server.js";

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log("1.0.0");
  process.exit(0);
}

const portFlagIdx = args.findIndex((a) => a === "-p" || a === "--port");
const port = Number.parseInt(portFlagIdx >= 0 ? args[portFlagIdx + 1] : "5522", 10);

const config     = readConfig();
const configPath = getConfigPath();

let teamId = null;
if (config) {
  if (config.provider && config.provider !== "linear") {
    console.error(chalk.red(`\n  Provider "${config.provider}" não é suportado.\n`));
    process.exit(1);
  }
  teamId = config._team_id;
  if (!teamId && config.api_key && config.scope) {
    const spinner = ora("Conectando ao Linear…").start();
    try {
      const team = await linear.getTeamByName(config, config.scope);
      if (team) teamId = team.id;
      spinner.stop();
    } catch { spinner.stop(); }
  }
}

try {
  const spinner = ora("Iniciando Agent Flow…").start();
  const { url } = await startBoardServer({ config, teamId, port, configPath });
  spinner.stop();
  console.log(`\n  ${chalk.bold.cyan("Agent Flow Board")}`);
  console.log(`  ${chalk.green("►")} ${chalk.underline(url)}\n`);
} catch (err) {
  console.error(chalk.red("\n  Erro: " + err.message + "\n"));
  process.exit(1);
}
