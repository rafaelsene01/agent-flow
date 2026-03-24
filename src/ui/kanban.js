import chalk from "chalk";

const COLUMN_WIDTH = 28;
const MAX_TITLE_LEN = COLUMN_WIDTH - 4;

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function pad(str, width) {
  const len = [...str].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
  const visible = stripAnsi(str).length;
  const ansiExtra = str.length - visible;
  return str + " ".repeat(Math.max(0, width - visible));
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

function padVisible(str, width) {
  const visible = stripAnsi(str).length;
  return str + " ".repeat(Math.max(0, width - visible));
}

function labelBadge(label) {
  const colors = {
    green: chalk.bgGreen.black,
    yellow: chalk.bgYellow.black,
    orange: chalk.bgHex("#FFA500").black,
    red: chalk.bgRed.white,
    purple: chalk.bgMagenta.white,
    blue: chalk.bgBlue.white,
    sky: chalk.bgCyan.black,
    lime: chalk.bgGreenBright.black,
    pink: chalk.bgHex("#FF69B4").black,
    black: chalk.bgBlack.white,
  };
  const color = colors[label.color] || chalk.bgGray.white;
  return color(` ${truncate(label.name || label.color, 8)} `);
}

function renderCard(card) {
  const inner = COLUMN_WIDTH - 2;
  const lines = [];

  // Title
  const title = truncate(card.name, inner - 1);
  lines.push(chalk.white.bold(padVisible(title, inner)));

  // Labels
  if (card.labels && card.labels.length > 0) {
    const badges = card.labels.map(labelBadge).join(" ");
    lines.push(padVisible(badges, inner));
  }

  // Members
  if (card.members && card.members.length > 0) {
    const names = card.members
      .map((m) => chalk.cyan("@" + (m.username || m.fullName.split(" ")[0])))
      .join(chalk.gray(", "));
    lines.push(padVisible(truncate(stripAnsi(names), inner - 1), inner));
  }

  // Due date
  if (card.due) {
    const due = new Date(card.due);
    const now = new Date();
    const overdue = due < now;
    const dueFmt = due.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    const dueStr = (overdue ? chalk.red : chalk.green)(`⏰ ${dueFmt}`);
    lines.push(padVisible(dueStr, inner));
  }

  // Short URL hint
  if (card.shortUrl) {
    lines.push(chalk.gray(truncate(card.shortUrl, inner)));
  }

  // Build card box
  const top = chalk.gray("┌" + "─".repeat(COLUMN_WIDTH - 2) + "┐");
  const bottom = chalk.gray("└" + "─".repeat(COLUMN_WIDTH - 2) + "┘");
  const mid = lines.map(
    (l) => chalk.gray("│") + " " + padVisible(l, COLUMN_WIDTH - 4) + " " + chalk.gray("│")
  );

  return [top, ...mid, bottom];
}

function renderColumnHeader(list, count) {
  const title = truncate(list.name, COLUMN_WIDTH - 8);
  const badge = chalk.bgWhite.black(` ${count} `);
  const header = chalk.bold.white(title) + " " + badge;
  const top = chalk.cyan("╔" + "═".repeat(COLUMN_WIDTH - 2) + "╗");
  const mid = chalk.cyan("║") + " " + padVisible(header, COLUMN_WIDTH - 4) + " " + chalk.cyan("║");
  const bot = chalk.cyan("╚" + "═".repeat(COLUMN_WIDTH - 2) + "╝");
  return [top, mid, bot];
}

export function renderKanban({ lists, cardsByList, config }) {
  const cols = lists.map((list) => {
    const cards = cardsByList[list.id] || [];
    const headerLines = renderColumnHeader(list, cards.length);
    const cardLines = [];

    if (cards.length === 0) {
      const empty = chalk.gray("  (empty)");
      cardLines.push(
        chalk.gray("│") + " " + padVisible(empty, COLUMN_WIDTH - 4) + " " + chalk.gray("│")
      );
    } else {
      for (const card of cards) {
        renderCard(card).forEach((l) => cardLines.push(l));
        cardLines.push(""); // spacing between cards
      }
    }

    return [...headerLines, "", ...cardLines];
  });

  // Find max height
  const maxRows = Math.max(...cols.map((c) => c.length));

  // Pad each column to same height
  const paddedCols = cols.map((col) => {
    while (col.length < maxRows) col.push("");
    return col;
  });

  // Print row by row
  const output = [];
  for (let row = 0; row < maxRows; row++) {
    const line = paddedCols
      .map((col) => padVisible(col[row] || "", COLUMN_WIDTH + 1))
      .join(chalk.gray(" "));
    output.push(line);
  }

  return output.join("\n");
}

export function renderHeader(boardName, totalCards) {
  const term = process.stdout.columns || 80;
  const title = `  📋  ${boardName}  ·  ${totalCards} cards`;
  const sep = chalk.cyan("─".repeat(Math.min(term, 120)));
  return (
    "\n" +
    chalk.bold.cyan(title) +
    "\n" +
    sep
  );
}

export function renderSummary(config) {
  const parts = [];
  if (config.pick_from) parts.push(`Showing: ${chalk.yellow(config.pick_from.join(", "))}`);
  if (config.label) parts.push(`Label: ${chalk.magenta(config.label)}`);
  if (parts.length) return chalk.gray("  " + parts.join("   ")) + "\n";
  return "";
}
