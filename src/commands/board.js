import chalk from "chalk";
import ora from "ora";
import { requireConfig } from "../config.js";
import * as linear from "../providers/linear.js";
import { renderKanban, renderHeader, renderSummary } from "../ui/kanban.js";

export async function boardCommand() {
  const config = requireConfig();

  if (config.provider !== "linear") {
    console.error(chalk.red(`\n  Provider "${config.provider}" is not supported.\n`));
    process.exit(1);
  }

  const spinner = ora("Connecting to Linear…").start();

  try {
    // Resolve team ID
    let teamId = config._team_id;
    if (!teamId) {
      const team = await linear.getTeamByName(config, config.scope);
      if (!team) {
        spinner.fail(chalk.red(`Team "${config.scope}" not found.`));
        process.exit(1);
      }
      teamId = team.id;
    }

    spinner.text = "Fetching issues…";

    const [allStates, issues] = await Promise.all([
      linear.getWorkflowStates(config, teamId),
      linear.getIssues(config, teamId),
    ]);

    spinner.stop();

    // Determine which states to show as columns
    let states = allStates;
    if (config.pick_from && config.pick_from.length > 0) {
      states = allStates.filter((s) =>
        config.pick_from.some((name) => name.toLowerCase() === s.name.toLowerCase())
      );
    }

    // Bucket issues by state
    const issuesByState = {};
    for (const state of states) {
      issuesByState[state.id] = issues.filter((i) => i.state.id === state.id);
    }

    // Annotate columns
    const annotatedStates = states.map((s) => ({
      ...s,
      _isInProgress: config.in_progress && s.name.toLowerCase() === config.in_progress.toLowerCase(),
      _isDone: config.done && s.name.toLowerCase() === config.done.toLowerCase(),
    }));

    const totalIssues = Object.values(issuesByState).reduce((acc, arr) => acc + arr.length, 0);

    // Adapt issues to the generic card shape the kanban renderer expects
    const cardsByColumn = {};
    for (const state of states) {
      cardsByColumn[state.id] = issuesByState[state.id].map((issue) => ({
        id: issue.id,
        name: `${chalk.gray(issue.identifier)}  ${issue.title}`,
        labels: issue.labels.nodes.map((l) => ({ name: l.name, color: hexToName(l.color) })),
        members: issue.assignee ? [{ username: issue.assignee.displayName }] : [],
        due: issue.dueDate ? issue.dueDate + "T00:00:00Z" : null,
        shortUrl: issue.url,
        priority: issue.priority,
      }));
    }

    console.clear();
    console.log(renderHeader(config.scope, totalIssues));
    console.log(renderSummary(config));
    console.log(renderKanban({ lists: annotatedStates, cardsByList: cardsByColumn, config }));
    console.log(
      "\n" +
        chalk.gray(
          `  Team: ${chalk.white(config.scope)}  ·  Provider: ${chalk.white("Linear")}  ·  Run ${chalk.white("hana board")} to refresh`
        ) +
        "\n"
    );
  } catch (err) {
    spinner.fail(chalk.red("Failed to fetch board data."));
    console.error(chalk.red("\n  " + err.message + "\n"));
    process.exit(1);
  }
}

// Map hex color to rough terminal color name for label badges
function hexToName(hex) {
  if (!hex) return "gray";
  const h = hex.replace("#", "").toLowerCase();
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (r > 200 && g < 100 && b < 100) return "red";
  if (r < 100 && g > 180 && b < 100) return "green";
  if (r < 100 && g < 100 && b > 200) return "blue";
  if (r > 200 && g > 180 && b < 100) return "yellow";
  if (r > 180 && g < 100 && b > 180) return "purple";
  if (r < 100 && g > 180 && b > 180) return "sky";
  if (r > 200 && g > 100 && b < 80)  return "orange";
  if (r > 200 && g > 150 && b > 180) return "pink";
  return "gray";
}
