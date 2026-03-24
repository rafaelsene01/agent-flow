import chalk from "chalk";
import { readConfig, getConfigPath } from "../config.js";

export function configShowCommand() {
  const config = readConfig();
  const path = getConfigPath();

  if (!config) {
    console.log(
      "\n" +
        chalk.yellow("  No config found.") +
        chalk.gray(` (looked for ${path})`) +
        "\n" +
        chalk.gray(`  Run ${chalk.white("hana init")} to set up.\n`)
    );
    return;
  }

  console.log("\n" + chalk.bold.cyan("  📄  Current config") + chalk.gray(` (${path})\n`));

  const rows = [
    ["provider",      config.provider],
    ["scope (team)",  config.scope],
    ["pick_from",     config.pick_from ? config.pick_from.join(", ") : chalk.gray("(all states)")],
    ["in_progress",   config.in_progress || chalk.gray("(not set)")],
    ["done",          config.done        || chalk.gray("(not set)")],
    ["label",         config.label       || chalk.gray("(not set)")],
  ];

  for (const [key, val] of rows) {
    console.log(`  ${chalk.gray(key.padEnd(18))} ${chalk.white(val)}`);
  }

  console.log();
}
