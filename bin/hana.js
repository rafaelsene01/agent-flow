#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { initCommand } from "../src/commands/init.js";
import { boardCommand } from "../src/commands/board.js";
import { configShowCommand } from "../src/commands/config-show.js";

const program = new Command();

program
  .name("hana")
  .description(chalk.cyan("🌸 Hana · Web Kanban for Linear"))
  .version("1.0.0");

program
  .command("init")
  .description("Set up Hana for your project (creates .hana.json)")
  .action(initCommand);

program
  .command("board")
  .alias("b")
  .description("Start the web Kanban board")
  .option("-p, --port <number>", "Port to expose the web board", "5522")
  .action((options) => {
    boardCommand({ port: options.port });
  });

program
  .command("config")
  .description("Show the current config")
  .action(configShowCommand);

if (process.argv.length === 2) {
  boardCommand({ port: "5522" });
} else {
  program.parse(process.argv);
}
