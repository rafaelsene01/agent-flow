import chalk from "chalk";
import ora from "ora";
import { requireConfig } from "../config.js";
import * as trello from "../providers/trello.js";
import { renderKanban, renderHeader, renderSummary } from "../ui/kanban.js";

export async function boardCommand(opts = {}) {
  const config = requireConfig();

  if (config.provider !== "trello") {
    console.error(chalk.red(`\n  Provider "${config.provider}" is not supported yet.\n`));
    process.exit(1);
  }

  const spinner = ora("Connecting to Trello…").start();

  try {
    // Resolve board ID
    let boardId = config._board_id;
    if (!boardId) {
      const board = await trello.getBoardByName(config, config.scope);
      if (!board) {
        spinner.fail(chalk.red(`Board "${config.scope}" not found.`));
        process.exit(1);
      }
      boardId = board.id;
    }

    spinner.text = "Fetching lists and cards…";

    const [allLists, allCards] = await Promise.all([
      trello.getLists(config, boardId),
      trello.getCards(config, boardId),
    ]);

    spinner.stop();

    // Filter lists by pick_from
    let lists = allLists;
    if (config.pick_from && config.pick_from.length > 0) {
      lists = allLists.filter((l) =>
        config.pick_from.some((name) => name.toLowerCase() === l.name.toLowerCase())
      );
    }

    // Filter cards by label if configured
    let cards = allCards;
    if (config.label) {
      cards = cards.filter(
        (c) =>
          c.labels &&
          c.labels.some((l) => l.name.toLowerCase() === config.label.toLowerCase())
      );
    }

    // Bucket cards by list
    const cardsByList = {};
    for (const list of lists) {
      cardsByList[list.id] = cards.filter((c) => c.idList === list.id);
    }

    // Apply column highlighting based on in_progress / done config
    const annotatedLists = lists.map((l) => ({
      ...l,
      _isInProgress:
        config.in_progress &&
        l.name.toLowerCase() === config.in_progress.toLowerCase(),
      _isDone:
        config.done && l.name.toLowerCase() === config.done.toLowerCase(),
    }));

    const totalCards = Object.values(cardsByList).reduce(
      (acc, arr) => acc + arr.length,
      0
    );

    // Render
    console.clear();
    console.log(renderHeader(config.scope, totalCards));
    console.log(renderSummary(config));
    console.log(
      renderKanban({ lists: annotatedLists, cardsByList, config })
    );
    console.log(
      "\n" +
        chalk.gray(
          `  Board: ${chalk.white(config.scope)}  ·  Provider: ${chalk.white("Trello")}  ·  Run ${chalk.white("hana board")} to refresh`
        ) +
        "\n"
    );
  } catch (err) {
    spinner.fail(chalk.red("Failed to fetch board data."));
    console.error(chalk.red("\n  " + err.message + "\n"));
    process.exit(1);
  }
}
