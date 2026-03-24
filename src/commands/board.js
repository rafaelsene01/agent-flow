import chalk from "chalk";
import ora from "ora";
import { requireConfig } from "../config.js";
import * as linear from "../providers/linear.js";
import { openKanban } from "../ui/tui.js";

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
async function fetchBoard(config, teamId) {
  const [allStates, issues] = await Promise.all([
    linear.getWorkflowStates(config, teamId),
    linear.getIssues(config, teamId),
  ]);

  // Todos os estados viram colunas — sem filtro de pick_from aqui
  const columns = allStates;

  const cardsByColumn = {};
  for (const state of columns) {
    cardsByColumn[state.id] = mapIssues(
      issues.filter((i) => i.state.id === state.id)
    );
  }

  return { columns, cardsByColumn };
}

export async function boardCommand() {
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

    spinner.text = "Buscando issues…";
    const { columns, cardsByColumn } = await fetchBoard(config, teamId);
    spinner.stop();

    // Abre o TUI — passa callback de refresh para polling em tempo real
    openKanban({
      columns,
      cardsByColumn,
      config,
      onRefresh: () => fetchBoard(config, teamId),
    });

  } catch (err) {
    spinner.fail(chalk.red("Falha ao carregar o board."));
    console.error(chalk.red("\n  " + err.message + "\n"));
    process.exit(1);
  }
}
