#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { initCommand } from "../src/commands/init.js";
import { boardCommand } from "../src/commands/board.js";
import { configShowCommand } from "../src/commands/config-show.js";

const program = new Command();

program
  .name("hana")
  .description(chalk.cyan("🌸 Hana · Terminal Kanban for Linear"))
  .version("1.0.0");

program
  .command("init")
  .description("Set up Hana for your project (creates .hana.json)")
  .action(initCommand);

program
  .command("board")
  .alias("b")
  .description("Open the Kanban board in your terminal")
  .action(boardCommand);

program
  .command("config")
  .description("Show the current config")
  .action(configShowCommand);

// Default: if no command given, open board
if (process.argv.length === 2) {
  boardCommand();
} else {
  program.parse(process.argv);
}
