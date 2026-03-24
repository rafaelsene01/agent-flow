import chalk from "chalk";
import ora from "ora";
import { requireConfig } from "../config.js";
import * as linear from "../providers/linear.js";
import { startBoardServer } from "../server/board-server.js";

// Mapeia issues brutas do Linear para o formato que o TUI espera
function mapIssues(issues) {
  return issues.map((i) => ({
    id:              i.id,
    identifier:      i.identifier,
    rawTitle:        i.title,
    title:           i.title,
    priority:        i.priority,
    url:             i.url,
    dueDate:         i.dueDate || null,
    description:     i.description || "",
    assigneeDisplay: i.assignee?.displayName || i.assignee?.name || null,
    rawLabels:       i.labels?.nodes || [],
  }));
}

// Busca todos os dados do board e devolve no formato { columns, cardsByColumn }
export async function fetchBoard(config, teamId) {
  const boardConfig = {
    ...config,
    pick_from: config.board_columns && config.board_columns.length > 0
      ? config.board_columns
      : config.pick_from,
  };

  const [allStates, issues] = await Promise.all([
    linear.getWorkflowStates(config, teamId),
    linear.getIssues(boardConfig, teamId),
  ]);

  const selectedStateNames = config.board_columns && config.board_columns.length > 0
    ? new Set(config.board_columns.map((name) => name.toLowerCase()))
    : null;

  // Se houver seleção de colunas no init, mostra apenas essas colunas.
  // Caso contrário, mantém todos os estados do time.
  const columns = selectedStateNames
    ? allStates.filter((state) => selectedStateNames.has((state.name || "").toLowerCase()))
    : allStates;

  // Mantém a coluna de concluído no fim, quando configurada.
  if (config.done) {
    const doneName = config.done.toLowerCase();
    const doneIndex = columns.findIndex((state) => (state.name || "").toLowerCase() === doneName);
    if (doneIndex >= 0 && doneIndex !== columns.length - 1) {
      const [doneColumn] = columns.splice(doneIndex, 1);
      columns.push(doneColumn);
    }
  }

  const cardsByColumn = {};
  for (const state of columns) {
    cardsByColumn[state.id] = mapIssues(
      issues.filter((i) => i.state.id === state.id)
    );
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
  const port = parsePort(inputPort);
  const config = requireConfig();

  if (config.provider !== "linear") {
    console.error(chalk.red(`\n  Provider "${config.provider}" não é suportado.\n`));
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

    spinner.text = "Iniciando servidor web…";
    const { url } = await startBoardServer({
      config,
      teamId,
      fetchBoard,
      port,
    });
    spinner.stop();
    console.log(chalk.green(`\n  Board disponível em ${url}\n`));

  } catch (err) {
    spinner.fail(chalk.red("Falha ao carregar o board."));
    console.error(chalk.red("\n  " + err.message + "\n"));
    process.exit(1);
  }
}
