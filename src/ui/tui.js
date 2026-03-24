import blessed from "blessed";

// ─── priority helpers ─────────────────────────────────────────────────────────

function priorityIcon(p) {
  switch (p) {
    case 1: return "{red-fg}⚡{/red-fg}";
    case 2: return "{yellow-fg}↑{/yellow-fg}";
    case 3: return "{cyan-fg}→{/cyan-fg}";
    case 4: return "{gray-fg}↓{/gray-fg}";
    default: return "{gray-fg}·{/gray-fg}";
  }
}

function priorityLabel(p) {
  switch (p) {
    case 0: return "{gray-fg}No priority{/gray-fg}";
    case 1: return "{red-fg}Urgent{/red-fg}";
    case 2: return "{yellow-fg}High{/yellow-fg}";
    case 3: return "{cyan-fg}Medium{/cyan-fg}";
    case 4: return "{gray-fg}Low{/gray-fg}";
    default: return "{gray-fg}—{/gray-fg}";
  }
}

// strip blessed tags for length calculation
function strip(s) {
  return (s || "").replace(/\{[^}]+\}/g, "");
}

function truncate(s, max) {
  const clean = strip(s || "");
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

// ─── main export ─────────────────────────────────────────────────────────────

export function openKanban({ columns, cardsByColumn, config }) {
  // ── screen ──────────────────────────────────────────────────────────────────
  const screen = blessed.screen({
    smartCSR: true,
    title: "Hana",
    fullUnicode: true,
    forceUnicode: true,
  });

  // ── state ───────────────────────────────────────────────────────────────────
  let colIdx  = 0;
  let cardIdx = 0;
  let mode    = "board"; // "board" | "detail"

  const SIDEBAR_W = 26;

  // ── sidebar ──────────────────────────────────────────────────────────────────
  const sidebar = blessed.box({
    top: 0, left: 0,
    width: SIDEBAR_W,
    height: "100%",
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    padding: { left: 1, right: 1 },
  });
  screen.append(sidebar);

  function renderSidebar() {
    const total = columns.reduce((n, c) => n + (cardsByColumn[c.id]?.length || 0), 0);
    const col   = columns[colIdx];
    const colCards = cardsByColumn[col?.id] || [];

    sidebar.setContent([
      "{bold}{cyan-fg}🌸 HANA{/cyan-fg}{/bold}",
      "",
      "{bold}Scope{/bold}",
      `{cyan-fg}${truncate(config.scope, SIDEBAR_W - 4)}{/cyan-fg}`,
      "",
      "{bold}Board{/bold}",
      `{white-fg}${columns.length}{/white-fg} colunas`,
      `{white-fg}${total}{/white-fg} issues`,
      "",
      "{bold}Cursor{/bold}",
      `Col: {yellow-fg}${truncate(col?.name || "", SIDEBAR_W - 8)}{/yellow-fg}`,
      `Card: {yellow-fg}${cardIdx + 1}/{colCards.length || 0}{/yellow-fg}`,
      "",
      "{bold}Atalhos{/bold}",
      "{yellow-fg}↑ ↓{/yellow-fg}  navegar cards",
      "{yellow-fg}← →{/yellow-fg}  trocar coluna",
      "{yellow-fg}↵{/yellow-fg}    ver detalhes",
      "{yellow-fg}esc{/yellow-fg}  voltar",
      "{yellow-fg}q{/yellow-fg}    sair",
    ].join("\n"));
  }

  // ── column boxes ─────────────────────────────────────────────────────────────
  const colBoxes = [];

  function buildColumns() {
    colBoxes.forEach((b) => b.detach());
    colBoxes.length = 0;

    const availW  = screen.width - SIDEBAR_W;
    const colW    = Math.max(22, Math.floor(availW / columns.length));

    columns.forEach((col, ci) => {
      const cards     = cardsByColumn[col.id] || [];
      const isActive  = ci === colIdx;

      const box = blessed.box({
        top: 0,
        left: SIDEBAR_W + ci * colW,
        width: colW,
        height: "100%",
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: { ch: " ", style: { bg: "cyan" } },
        border: { type: "line" },
        style: {
          border: { fg: isActive ? "cyan" : "gray" },
          bg: "black",
        },
        label: isActive
          ? ` {bold}{cyan-fg}${col.name}{/cyan-fg}{/bold} {gray-fg}(${cards.length}){/gray-fg} `
          : ` {gray-fg}${col.name}{/gray-fg} {gray-fg}(${cards.length}){/gray-fg} `,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
      });

      const innerW = colW - 4;

      let content = "";
      if (cards.length === 0) {
        content = "\n{gray-fg}(vazio){/gray-fg}";
      } else {
        content = cards
          .map((card, ki) => {
            const selected = isActive && ki === cardIdx;
            const icon     = priorityIcon(card.priority);
            const title    = truncate(card.rawTitle || card.title || "", innerW - 3);
            const id       = `{gray-fg}${card.identifier || ""}{/gray-fg}`;
            const assignee = card.assigneeDisplay
              ? `{cyan-fg}@${truncate(card.assigneeDisplay, innerW - 2)}{/cyan-fg}`
              : "";
            const labels   = (card.rawLabels || [])
              .map((l) => `{magenta-fg}#${l.name}{/magenta-fg}`)
              .join(" ");
            const due      = card.dueDate
              ? `{${isDue(card.dueDate) ? "red" : "green"}-fg}⏰ ${fmtDate(card.dueDate)}{/${isDue(card.dueDate) ? "red" : "green"}-fg}`
              : "";

            const lines = [
              selected
                ? `{black-fg}{cyan-bg} ${icon} ${title} {/cyan-bg}{/black-fg}`
                : `${icon} {white-fg}${title}{/white-fg}`,
              `   ${id}`,
              labels   ? `   ${labels}`  : null,
              assignee ? `   ${assignee}` : null,
              due      ? `   ${due}`      : null,
              "",
            ].filter((l) => l !== null).join("\n");

            return lines;
          })
          .join("");
      }

      box.setContent(content);

      // scroll selected card into view
      if (isActive && cards.length > 0) {
        // each card is roughly 4-5 lines
        const approxLinePerCard = 5;
        box.scrollTo(cardIdx * approxLinePerCard);
      }

      screen.append(box);
      colBoxes.push(box);
    });
  }

  // ── detail overlay ───────────────────────────────────────────────────────────
  const detailBox = blessed.box({
    top: "5%",
    left: SIDEBAR_W + 2,
    width: `${screen.width - SIDEBAR_W - 4}`,
    height: "90%",
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "yellow" }, bg: "black" },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: " ", style: { bg: "yellow" } },
    label: " {bold}{yellow-fg} Detalhes {/yellow-fg}{/bold} ",
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    hidden: true,
  });
  screen.append(detailBox);

  function showDetail() {
    const col   = columns[colIdx];
    const cards = cardsByColumn[col?.id] || [];
    const card  = cards[cardIdx];
    if (!card) return;

    const w = screen.width - SIDEBAR_W - 10;

    const lines = [
      `{bold}{cyan-fg}${card.identifier || ""}{/cyan-fg}  ${card.rawTitle || card.title || ""}{/bold}`,
      "",
      `{bold}Estado:{/bold}      ${col.name}`,
      `{bold}Prioridade:{/bold}  ${priorityLabel(card.priority)}`,
      `{bold}Assignee:{/bold}    ${card.assigneeDisplay ? "{cyan-fg}@" + card.assigneeDisplay + "{/cyan-fg}" : "{gray-fg}—{/gray-fg}"}`,
      `{bold}Due:{/bold}         ${card.dueDate ? fmtDate(card.dueDate) : "{gray-fg}—{/gray-fg}"}`,
      (card.rawLabels || []).length
        ? `{bold}Labels:{/bold}      ${card.rawLabels.map((l) => `{magenta-fg}#${l.name}{/magenta-fg}`).join("  ")}`
        : null,
      "",
      `{bold}URL:{/bold}`,
      `{underline}{cyan-fg}${card.url || "—"}{/cyan-fg}{/underline}`,
      "",
      "{bold}Descrição:{/bold}",
      card.description
        ? wrapText(card.description, w)
        : "{gray-fg}(sem descrição){/gray-fg}",
      "",
      "{gray-fg}[esc] voltar ao board{/gray-fg}",
    ]
      .filter((l) => l !== null)
      .join("\n");

    detailBox.setContent(lines);
    detailBox.scrollTo(0);
    detailBox.show();
    mode = "detail";
    screen.render();
  }

  function hideDetail() {
    detailBox.hide();
    mode = "board";
    screen.render();
  }

  // ── keybindings ──────────────────────────────────────────────────────────────
  screen.key(["q", "C-c"], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(["escape"], () => {
    if (mode === "detail") hideDetail();
  });

  screen.key(["enter"], () => {
    if (mode === "board") showDetail();
  });

  screen.key(["left", "h"], () => {
    if (mode !== "board") return;
    if (colIdx > 0) { colIdx--; cardIdx = 0; refresh(); }
  });

  screen.key(["right", "l"], () => {
    if (mode !== "board") return;
    if (colIdx < columns.length - 1) { colIdx++; cardIdx = 0; refresh(); }
  });

  screen.key(["up", "k"], () => {
    if (mode !== "board") return;
    if (cardIdx > 0) { cardIdx--; refresh(); }
  });

  screen.key(["down", "j"], () => {
    if (mode !== "board") return;
    const cards = cardsByColumn[columns[colIdx]?.id] || [];
    if (cardIdx < cards.length - 1) { cardIdx++; refresh(); }
  });

  // re-render on resize
  screen.on("resize", () => refresh());

  function refresh() {
    renderSidebar();
    buildColumns();
    screen.render();
  }

  // ── initial render ───────────────────────────────────────────────────────────
  refresh();
}

// ─── utils ────────────────────────────────────────────────────────────────────

function fmtDate(d) {
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00Z");
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function isDue(d) {
  return new Date(d.includes("T") ? d : d + "T00:00:00Z") < new Date();
}

function wrapText(text, width) {
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => {
      const words = line.split(" ");
      const rows = [];
      let cur = "";
      for (const w of words) {
        if (cur.length + w.length + 1 > width) { rows.push(cur); cur = w; }
        else cur = cur ? cur + " " + w : w;
      }
      if (cur) rows.push(cur);
      return rows.join("\n");
    })
    .join("\n");
}
