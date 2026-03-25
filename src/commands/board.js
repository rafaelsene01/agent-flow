import chalk from "chalk";
import ora from "ora";
import { readConfig, getConfigPath } from "../config.js";
import * as linear from "../sources/linear.js";
import { startBoardServer } from "../server/board-server.js";

function mapIssues(issues) {
  return issues.map((i) => ({
    id:              i.id,
    identifier:      i.identifier,
    rawTitle:        i.title,
    title:           i.title,
    priority:        i.priority,
    url:             i.url,
    dueDate:         i.dueDate || null,
    completedAt:     i.completedAt || null,
    description:     i.description || "",
    assigneeDisplay: i.assignee?.displayName || i.assignee?.name || null,
    rawLabels:       i.labels?.nodes || [],
  }));
}

export async function fetchBoard(config, teamId) {
  const boardConfig = {
    ...config,
    pick_from: config.board_columns?.length ? config.board_columns : config.pick_from,
  };

  const [allStates, issues] = await Promise.all([
    linear.getWorkflowStates(config, teamId),
    linear.getIssues(boardConfig, teamId),
  ]);

  const selectedNames = config.board_columns?.length
    ? new Set(config.board_columns.map((n) => n.toLowerCase()))
    : null;

  let columns = selectedNames
    ? allStates.filter((s) => selectedNames.has(s.name.toLowerCase()))
    : [...allStates];

  if (config.done) {
    const doneName = config.done.toLowerCase();
    const idx = columns.findIndex((s) => s.name.toLowerCase() === doneName);
    if (idx >= 0 && idx !== columns.length - 1) {
      columns.push(columns.splice(idx, 1)[0]);
    }
  }

  // done_days filter: only apply to the "done" column
  const doneDays = Number(config.done_days ?? 0);
  const doneColName = (config.done || "").toLowerCase();
  const cutoff = doneDays > 0
    ? new Date(Date.now() - doneDays * 24 * 60 * 60 * 1000)
    : null;

  const cardsByColumn = {};
  for (const state of columns) {
    let cards = mapIssues(issues.filter((i) => i.state.id === state.id));

    // Apply done_days filter only to the configured done column
    if (cutoff && doneColName && state.name.toLowerCase() === doneColName) {
      cards = cards.filter((c) => {
        if (!c.completedAt) return false;
        return new Date(c.completedAt) >= cutoff;
      });
    }

    cardsByColumn[state.id] = cards;
  }

  return { columns, cardsByColumn };
}

function parsePort(input) {
  const port = Number.parseInt(String(input ?? "5522"), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Porta inválida: "${input}". Use um valor entre 1 e 65535.`);
  }
  return port;
}

export async function boardCommand({ port: inputPort } = {}) {
  const port       = parsePort(inputPort);
  const config     = readConfig();     // null if no .hana.json — that's fine
  const configPath = getConfigPath();

  // If config exists, resolve teamId upfront so the first board load is fast.
  // If no config, the server still starts; the frontend will show the setup modal.
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
        if (team) { teamId = team.id; }
        spinner.stop();
      } catch {
        spinner.stop();
      }
    }
  }

  try {
    const spinner = ora("Iniciando Hana…").start();
    const { url } = await startBoardServer({ config, teamId, fetchBoard, port, configPath });
    spinner.stop();

    console.log(`\n  🌸  ${chalk.bold.cyan("Hana Board")}`);
    console.log(`  ${chalk.green("►")} ${chalk.underline(url)}\n`);

    if (!config) {
      console.log(chalk.yellow("  Nenhum .hana.json encontrado — abrindo configuração no browser.\n"));
    }
  } catch (err) {
    console.error(chalk.red("\n  Erro: " + err.message + "\n"));
    process.exit(1);
  }
}
