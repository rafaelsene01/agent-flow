import chalk from "chalk";
import ora from "ora";
import { requireConfig } from "../config.js";
import * as linear from "../providers/linear.js";
import { openKanban } from "../ui/tui.js";

export async function boardCommand() {
  const config = requireConfig();

  if (config.provider !== "linear") {
    console.error(chalk.red(`\n  Provider "${config.provider}" is not supported.\n`));
    process.exit(1);
  }

  const spinner = ora("Conectando ao Linear…").start();

  try {
    // Resolve team ID
    let teamId = config._team_id;
    if (!teamId) {
      const team = await linear.getTeamByName(config, config.scope);
      if (!team) {
        spinner.fail(chalk.red(`Time "${config.scope}" não encontrado.`));
        process.exit(1);
      }
      teamId = team.id;
    }

    spinner.text = "Buscando issues…";

    const [allStates, issues] = await Promise.all([
      linear.getWorkflowStates(config, teamId),
      linear.getIssues(config, teamId),
    ]);

    spinner.stop();

    // Filter states to show
    let states = allStates;
    if (config.pick_from && config.pick_from.length > 0) {
      states = allStates.filter((s) =>
        config.pick_from.some((n) => n.toLowerCase() === s.name.toLowerCase())
      );
    }

    // Bucket issues by state, mapping to the shape tui.js expects
    const cardsByColumn = {};
    for (const state of states) {
      cardsByColumn[state.id] = issues
        .filter((i) => i.state.id === state.id)
        .map((i) => ({
          id:             i.id,
          identifier:     i.identifier,
          rawTitle:       i.title,
          title:          i.title,
          priority:       i.priority,
          url:            i.url,
          dueDate:        i.dueDate || null,
          description:    i.description || "",
          assigneeDisplay: i.assignee?.displayName || i.assignee?.name || null,
          rawLabels:      i.labels?.nodes || [],
          members:        i.assignee ? [{ username: i.assignee.displayName }] : [],
        }));
    }

    // Open the interactive TUI
    openKanban({ columns: states, cardsByColumn, config });

  } catch (err) {
    spinner.fail(chalk.red("Falha ao buscar dados."));
    console.error(chalk.red("\n  " + err.message + "\n"));
    process.exit(1);
  }
}
