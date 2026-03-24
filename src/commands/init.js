import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { writeConfig, readConfig, getConfigPath } from "../config.js";
import * as linear from "../providers/linear.js";

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

  // Provider — only Linear for now
  const { provider } = await inquirer.prompt([
    {
      type: "list",
      name: "provider",
      message: "Choose your board source:",
      choices: [{ name: "Linear", value: "linear" }],
    },
  ]);

  const config = { provider };
  await setupLinear(config);

  console.log(chalk.green(`\n  ✅  Config saved to ${getConfigPath()}\n`));
  console.log(chalk.gray(`  Run ${chalk.white("hana board")} to open your Kanban.\n`));
}

async function setupLinear(config) {
  console.log(
    "\n" +
      chalk.cyan("  Linear Setup\n") +
      chalk.gray("  You need a Personal API Key from Linear.\n") +
      chalk.gray("  Get yours at: ") +
      chalk.underline("https://linear.app/settings/api") +
      "\n"
  );

  const { api_key } = await inquirer.prompt([
    {
      type: "password",
      name: "api_key",
      message: "Linear API Key:",
      mask: "•",
      validate: (v) => v.trim().length > 0 || "API key is required",
    },
  ]);

  config.api_key = api_key.trim();

  // Validate
  const spinner = ora("Validating credentials…").start();
  const valid = await linear.validateCredentials(config);
  if (!valid) {
    spinner.fail(chalk.red("Invalid API key. Check it at https://linear.app/settings/api"));
    process.exit(1);
  }
  const member = await linear.getMemberInfo(config);
  spinner.succeed(chalk.green(`Connected as ${chalk.bold(member.name)} (${member.email})`));

  // Step 2: Pick team (scope)
  const teamsSpinner = ora("Fetching teams…").start();
  const teams = await linear.getTeams(config);
  teamsSpinner.stop();

  if (teams.length === 0) {
    console.log(chalk.red("  No teams found on your account."));
    process.exit(1);
  }

  const { teamId } = await inquirer.prompt([
    {
      type: "list",
      name: "teamId",
      message: "Which team? (scope)",
      choices: teams.map((t) => ({ name: `${t.name}  ${chalk.gray("[" + t.key + "]")}`, value: t.id })),
      pageSize: 12,
    },
  ]);

  const selectedTeam = teams.find((t) => t.id === teamId);
  config.scope = selectedTeam.name;
  config._team_id = teamId;

  // Step 3: Workflow states (board columns)
  const statesSpinner = ora("Fetching workflow states…").start();
  const states = await linear.getWorkflowStates(config, teamId);
  statesSpinner.stop();

  const { boardColumns } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "boardColumns",
      message: "Which states should appear as board columns? (board_columns)",
      choices: states.map((s) => ({ name: s.name, value: s.name })),
      default: states.map((s) => s.name),
      pageSize: 14,
    },
  ]);

  if (boardColumns.length === 0) {
    console.log(chalk.red("  Select at least one column state."));
    process.exit(1);
  }
  if (boardColumns.length < states.length) {
    config.board_columns = boardColumns;
  }

  const boardStateSet = new Set(boardColumns.map((name) => name.toLowerCase()));
  const boardStates = states.filter((s) => boardStateSet.has((s.name || "").toLowerCase()));

  // Step 4: Source states for AI
  const { pickFrom } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "pickFrom",
      message: "Which states can AI read activities from? (pick_from — leave empty for all)",
      choices: boardStates.map((s) => ({ name: s.name, value: s.name })),
      pageSize: 14,
    },
  ]);
  if (pickFrom.length > 0) config.pick_from = pickFrom;

  // Step 5: In Progress state
  const { inProgress } = await inquirer.prompt([
    {
      type: "list",
      name: "inProgress",
      message: "Which state is 'In Progress'? (in_progress)",
      choices: [
        { name: chalk.gray("(skip)"), value: null },
        ...boardStates.map((s) => ({ name: s.name, value: s.name })),
      ],
    },
  ]);
  if (inProgress) config.in_progress = inProgress;

  // Step 6: Done state
  const { done } = await inquirer.prompt([
    {
      type: "list",
      name: "done",
      message: "Which state is 'Done'? (done)",
      choices: [
        { name: chalk.gray("(skip)"), value: null },
        ...boardStates.map((s) => ({ name: s.name, value: s.name })),
      ],
    },
  ]);
  if (done) config.done = done;

  // Step 7: Label filter (optional)
  const labelsSpinner = ora("Fetching labels…").start();
  const labels = await linear.getLabels(config, teamId);
  labelsSpinner.stop();

  if (labels.length > 0) {
    const { label } = await inquirer.prompt([
      {
        type: "list",
        name: "label",
        message: "Filter by label? (label — optional)",
        choices: [
          { name: chalk.gray("(no filter)"), value: null },
          ...labels.map((l) => ({ name: l.name, value: l.name })),
        ],
      },
    ]);
    if (label) config.label = label;
  }

  writeConfig(config);
}
