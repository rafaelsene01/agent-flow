import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { writeConfig, readConfig, getConfigPath } from "../config.js";
import * as trello from "../providers/trello.js";

export async function initCommand() {
  const existing = readConfig();

  console.log("\n" + chalk.bold.cyan("  🌸  Hana · Board Setup\n"));

  if (existing) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: chalk.yellow(`Config already exists (${getConfigPath()}). Overwrite?`),
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.gray("\n  Keeping existing config. Bye!\n"));
      return;
    }
  }

  // Step 1: Choose provider (only Trello for now)
  const { provider } = await inquirer.prompt([
    {
      type: "list",
      name: "provider",
      message: "Choose your board source:",
      choices: [
        { name: "Trello", value: "trello" },
      ],
    },
  ]);

  let config = { provider };

  if (provider === "trello") {
    await setupTrello(config);
  }

  console.log(chalk.green(`\n  ✅  Config saved to ${getConfigPath()}\n`));
  console.log(chalk.gray(`  Run ${chalk.white("hana board")} to open your Kanban.\n`));
}

async function setupTrello(config) {
  console.log(
    "\n" +
      chalk.cyan("  Trello Setup\n") +
      chalk.gray("  You need an API Key and a Token from Trello.\n") +
      chalk.gray("  ① Get your API key at: ") +
      chalk.underline("https://trello.com/app-key") +
      "\n" +
      chalk.gray("  ② Generate a token from the same page (click \"Token\").\n")
  );

  const { api_key } = await inquirer.prompt([
    {
      type: "password",
      name: "api_key",
      message: "Trello API Key:",
      mask: "•",
      validate: (v) => v.trim().length > 0 || "API key is required",
    },
  ]);

  const { api_token } = await inquirer.prompt([
    {
      type: "password",
      name: "api_token",
      message: "Trello Token:",
      mask: "•",
      validate: (v) => v.trim().length > 0 || "Token is required",
    },
  ]);

  config.api_key = api_key.trim();
  config.api_token = api_token.trim();

  // Validate credentials
  const spinner = ora("Validating credentials…").start();
  const valid = await trello.validateCredentials(config);
  if (!valid) {
    spinner.fail(chalk.red("Invalid API key or token. Please check your credentials."));
    process.exit(1);
  }

  const member = await trello.getMemberInfo(config);
  spinner.succeed(chalk.green(`Connected as ${chalk.bold(member.fullName)} (@${member.username})`));

  // Step 2: Pick a board (scope)
  const boardsSpinner = ora("Fetching your boards…").start();
  const boards = await trello.getBoards(config);
  boardsSpinner.stop();

  if (boards.length === 0) {
    console.log(chalk.red("  No open boards found on your account."));
    process.exit(1);
  }

  const { boardId } = await inquirer.prompt([
    {
      type: "list",
      name: "boardId",
      message: "Which board? (scope)",
      choices: boards.map((b) => ({ name: b.name, value: b.id })),
      pageSize: 12,
    },
  ]);

  const selectedBoard = boards.find((b) => b.id === boardId);
  config.scope = selectedBoard.name;
  config._board_id = boardId; // cache the ID

  // Step 3: Pick which lists to show (pick_from)
  const listsSpinner = ora("Fetching lists…").start();
  const lists = await trello.getLists(config, boardId);
  listsSpinner.stop();

  const { pickFrom } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "pickFrom",
      message: "Which lists to show? (pick_from — leave empty for all)",
      choices: lists.map((l) => ({ name: l.name, value: l.name })),
      pageSize: 12,
    },
  ]);

  if (pickFrom.length > 0) config.pick_from = pickFrom;

  // Step 4: Mark in-progress column
  const { inProgress } = await inquirer.prompt([
    {
      type: "list",
      name: "inProgress",
      message: "Which list is 'In Progress'? (in_progress)",
      choices: [
        { name: chalk.gray("(skip)"), value: null },
        ...lists.map((l) => ({ name: l.name, value: l.name })),
      ],
    },
  ]);
  if (inProgress) config.in_progress = inProgress;

  // Step 5: Mark done column
  const { done } = await inquirer.prompt([
    {
      type: "list",
      name: "done",
      message: "Which list is 'Done'? (done)",
      choices: [
        { name: chalk.gray("(skip)"), value: null },
        ...lists.map((l) => ({ name: l.name, value: l.name })),
      ],
    },
  ]);
  if (done) config.done = done;

  // Step 6: Optional label filter
  const { label } = await inquirer.prompt([
    {
      type: "input",
      name: "label",
      message: "Filter by label name? (label — leave empty to skip)",
      default: "",
    },
  ]);
  if (label.trim()) config.label = label.trim();

  writeConfig(config);
}
