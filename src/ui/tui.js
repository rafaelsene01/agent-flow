import blessed from "blessed";

// ─── Linear state type → color / icon ────────────────────────────────────────
const STATE_COLOR = {
  triage:    "magenta",
  backlog:   "gray",
  unstarted: "blue",
  started:   "cyan",
  completed: "green",
  cancelled: "red",
};

// ─── priority ─────────────────────────────────────────────────────────────────
function priorityIcon(p) {
  switch (p) {
    case 1:  return "{red-fg}😱{/red-fg}";
    case 2:  return "{yellow-fg}😬{/yellow-fg}";
    case 3:  return "{cyan-fg}🙂{/cyan-fg}";
    case 4:  return "{gray-fg}😴{/gray-fg}";
    default: return "{gray-fg}{/gray-fg}";
  }
}

function priorityLabel(p) {
  switch (p) {
    case 0:  return "{gray-fg}Sem prioridade{/gray-fg}";
    case 1:  return "{red-fg}Urgente{/red-fg}";
    case 2:  return "{yellow-fg}Alta{/yellow-fg}";
    case 3:  return "{cyan-fg}Média{/cyan-fg}";
    case 4:  return "{gray-fg}Baixa{/gray-fg}";
    default: return "{gray-fg}—{/gray-fg}";
  }
}

// ─── text utils ───────────────────────────────────────────────────────────────
function strip(s) { return (s || "").replace(/\{[^}]+\}/g, ""); }

function truncate(s, max) {
  const c = strip(s || "");
  return c.length > max ? c.slice(0, max - 1) + "…" : c;
}

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00Z");
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function isDue(d) {
  if (!d) return false;
  return new Date(d.includes("T") ? d : d + "T00:00:00Z") < new Date();
}

function fmtTime(dt) {
  return dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function wrapText(text, width) {
  if (!text || width < 8) return text || "";
  return text.split("\n").map((line) => {
    if (!line.trim()) return "";
    const words = line.split(" ");
    const rows  = [];
    let cur     = "";
    for (const w of words) {
      if (cur.length + w.length + 1 > width) { rows.push(cur); cur = w; }
      else cur = cur ? cur + " " + w : w;
    }
    if (cur) rows.push(cur);
    return rows.join("\n");
  }).join("\n");
}

function cardLineCount(card) {
  let n = 2; // title + identifier
  if ((card.rawLabels || []).length) n++;
  if (card.assigneeDisplay) n++;
  if (card.dueDate) n++;
  n++; // blank spacer
  return n;
}

// ─── main ─────────────────────────────────────────────────────────────────────
const SIDEBAR_W = 26;
const POLL_MS   = 30_000;

export function openKanban({ columns: initColumns, cardsByColumn: initCards, config, onRefresh }) {
  let columns       = initColumns;
  let cardsByColumn = initCards;

  let colIdx  = 0;
  let cardIdx = 0;
  let mode    = "board"; // "board" | "detail" | "refreshing"
  let lastSync = new Date();
  let syncTimer = null;
  let pollTimer = null;

  // ── screen ───────────────────────────────────────────────────────────────────
  const screen = blessed.screen({
    smartCSR: true,
    title: "Hana",
    fullUnicode: true,
    forceUnicode: true,
  });

  // ── sidebar ──────────────────────────────────────────────────────────────────
  const sidebar = blessed.box({
    top: 0, left: 0,
    width: SIDEBAR_W,
    height: "100%-1",
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    padding: { left: 1, right: 1 },
  });
  screen.append(sidebar);

  // ── status bar (bottom) ──────────────────────────────────────────────────────
  const statusBar = blessed.box({
    bottom: 0, left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { bg: "cyan", fg: "black" },
  });
  screen.append(statusBar);

  // ── column area ──────────────────────────────────────────────────────────────
  const colBoxes = [];

  // ── detail overlay ───────────────────────────────────────────────────────────
  const detailBox = blessed.box({
    top: 2,
    left: SIDEBAR_W + 1,
    width: screen.width - SIDEBAR_W - 2,
    height: screen.height - 4,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "yellow" }, bg: "black" },
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    scrollbar: { ch: "▐", style: { fg: "yellow" } },
    label: " {bold}{yellow-fg} Issue {/yellow-fg}{/bold} ",
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    hidden: true,
  });
  screen.append(detailBox);

  // ── sync flash overlay ────────────────────────────────────────────────────────
  const syncFlash = blessed.box({
    top: 1, right: 2,
    width: 22, height: 1,
    tags: true,
    style: { bg: "black" },
    hidden: true,
  });
  screen.append(syncFlash);

  // ─── sidebar content ─────────────────────────────────────────────────────────
  function renderSidebar() {
    const total    = columns.reduce((n, c) => n + (cardsByColumn[c.id]?.length || 0), 0);
    const col      = columns[colIdx];
    const colCards = cardsByColumn[col?.id] || [];
    const stColor  = STATE_COLOR[col?.type] || "white";

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
      `{${stColor}-fg}${truncate(col?.name || "", SIDEBAR_W - 6)}{/${stColor}-fg}`,
      `{gray-fg}${cardIdx + 1} / ${colCards.length || 0}{/gray-fg}`,
      "",
      "{bold}Sync{/bold}",
      `{gray-fg}${fmtTime(lastSync)}{/gray-fg}`,
      `{gray-fg}a cada 30s{/gray-fg}`,
      "",
      "{bold}Atalhos{/bold}",
      `{yellow-fg}↑↓{/yellow-fg} {gray-fg}navegar cards{/gray-fg}`,
      `{yellow-fg}←→{/yellow-fg} {gray-fg}trocar coluna{/gray-fg}`,
      `{yellow-fg}↵{/yellow-fg}  {gray-fg}ver detalhes{/gray-fg}`,
      `{yellow-fg}r{/yellow-fg}  {gray-fg}atualizar agora{/gray-fg}`,
      `{yellow-fg}esc{/yellow-fg} {gray-fg}voltar{/gray-fg}`,
      `{yellow-fg}q{/yellow-fg}  {gray-fg}sair{/gray-fg}`,
    ].join("\n"));
  }

  // ─── status bar content ───────────────────────────────────────────────────────
  function renderStatusBar(msg) {
    const col      = columns[colIdx];
    const colCards = cardsByColumn[col?.id] || [];
    const card     = colCards[cardIdx];
    const id       = card ? `{bold}${card.identifier}{/bold}  ` : "";
    const base     = msg || `${id}{gray-fg}${col?.name || ""}{/gray-fg}`;
    statusBar.setContent(` 🌸 hana  ${base}`);
  }

  // ─── build column boxes ───────────────────────────────────────────────────────
  function buildColumns() {
    colBoxes.forEach((b) => b.detach());
    colBoxes.length = 0;

    const availW = screen.width - SIDEBAR_W;
    const colW   = Math.max(24, Math.floor(availW / Math.max(1, columns.length)));

    columns.forEach((col, ci) => {
      const cards    = cardsByColumn[col.id] || [];
      const isActive = ci === colIdx;
      const stColor  = STATE_COLOR[col.type] || "white";

      const box = blessed.box({
        top: 0,
        left: SIDEBAR_W + ci * colW,
        width: colW,
        height: "100%-1",
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: { ch: "▐", style: { fg: isActive ? "cyan" : "gray" } },
        border: { type: "line" },
        style: {
          border: { fg: isActive ? "cyan" : "gray" },
          bg: "black",
        },
        label: isActive
          ? ` {bold}{${stColor}-fg}${col.name}{/${stColor}-fg}{/bold} {white-fg}${cards.length}{/white-fg} `
          : ` {${stColor}-fg}${col.name}{/${stColor}-fg} {gray-fg}${cards.length}{/gray-fg} `,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
      });

      const innerW = colW - 4;

      let content = "";
      if (cards.length === 0) {
        content = "\n{gray-fg}  (vazio){/gray-fg}";
      } else {
        content = cards.map((card, ki) => {
          const sel    = isActive && ki === cardIdx;
          const icon   = priorityIcon(card.priority);
          const title  = truncate(card.rawTitle || "", innerW - 4);
          const idStr  = `{gray-fg}${card.identifier || ""}{/gray-fg}`;
          const asgn   = card.assigneeDisplay
            ? `{cyan-fg}@${truncate(card.assigneeDisplay, innerW - 3)}{/cyan-fg}`
            : null;
          const lbls   = (card.rawLabels || []).length
            ? (card.rawLabels).map((l) => `{magenta-fg}#${l.name}{/magenta-fg}`).join(" ")
            : null;
          const due    = card.dueDate
            ? `{${isDue(card.dueDate) ? "red" : "green"}-fg}⏰ ${fmtDate(card.dueDate)}{/${isDue(card.dueDate) ? "red" : "green"}-fg}`
            : null;

          const titleLine = sel
            ? `{black-fg}{cyan-bg} ${icon} ${title} {/cyan-bg}{/black-fg}`
            : `${icon} {white-fg}${title}{/white-fg}`;

          return [titleLine, `  ${idStr}`, lbls && `  ${lbls}`, asgn && `  ${asgn}`, due && `  ${due}`, ""]
            .filter((l) => l !== null)
            .join("\n");
        }).join("");
      }

      box.setContent(content);

      // scroll active column to keep selected card visible
      if (isActive && cards.length > 0) {
        let offset = 0;
        for (let i = 0; i < cardIdx; i++) offset += cardLineCount(cards[i]);
        box.scrollTo(offset);
      }

      screen.append(box);
      colBoxes.push(box);
    });
  }

  // ─── detail view ─────────────────────────────────────────────────────────────
  function showDetail() {
    const col   = columns[colIdx];
    const cards = cardsByColumn[col?.id] || [];
    const card  = cards[cardIdx];
    if (!card) return;

    const w = Math.max(20, screen.width - SIDEBAR_W - 10);

    // Resize detail box on each open (handles terminal resize)
    detailBox.width  = screen.width - SIDEBAR_W - 2;
    detailBox.height = screen.height - 4;

    const stColor = STATE_COLOR[col.type] || "white";
    const lines = [
      `{bold}{cyan-fg}${card.identifier}{/cyan-fg}  ${card.rawTitle || ""}{/bold}`,
      `{${stColor}-fg}${"─".repeat(Math.min(w, 60))}{/${stColor}-fg}`,
      "",
      `{bold}{gray-fg}ESTADO{/gray-fg}{/bold}       {${stColor}-fg}${col.name}{/${stColor}-fg}`,
      `{bold}{gray-fg}PRIORIDADE{/gray-fg}{/bold}   ${priorityLabel(card.priority)}`,
      `{bold}{gray-fg}ASSIGNEE{/gray-fg}{/bold}     ${card.assigneeDisplay ? `{cyan-fg}@${card.assigneeDisplay}{/cyan-fg}` : "{gray-fg}não atribuído{/gray-fg}"}`,
      `{bold}{gray-fg}VENCIMENTO{/gray-fg}{/bold}   ${card.dueDate ? `{${isDue(card.dueDate) ? "red" : "green"}-fg}${fmtDate(card.dueDate)}{/${isDue(card.dueDate) ? "red" : "green"}-fg}` : "{gray-fg}—{/gray-fg}"}`,
      (card.rawLabels || []).length
        ? `{bold}{gray-fg}LABELS{/gray-fg}{/bold}       ${card.rawLabels.map((l) => `{magenta-fg}#${l.name}{/magenta-fg}`).join("  ")}`
        : null,
      "",
      `{bold}{gray-fg}URL{/gray-fg}{/bold}`,
      `{cyan-fg}${card.url || "—"}{/cyan-fg}`,
      "",
      `{bold}{gray-fg}DESCRIÇÃO{/gray-fg}{/bold}`,
      card.description && card.description.trim()
        ? wrapText(card.description.replace(/\*\*/g, "").replace(/#{1,6} /g, ""), w)
        : "{gray-fg}(sem descrição){/gray-fg}",
      "",
      "{gray-fg}─────────────────────────────────{/gray-fg}",
      "{gray-fg}[esc] voltar  [↑↓] scroll{/gray-fg}",
    ].filter((l) => l !== null).join("\n");

    detailBox.setContent(lines);
    detailBox.scrollTo(0);
    detailBox.show();
    detailBox.focus();
    mode = "detail";
    renderStatusBar(`{yellow-fg}detalhes: ${card.identifier}{/yellow-fg}  {gray-fg}esc para voltar{/gray-fg}`);
    screen.render();
  }

  function hideDetail() {
    detailBox.hide();
    mode = "board";
    refresh();
  }

  // ─── live refresh ─────────────────────────────────────────────────────────────
  function flashSync(ok) {
    const msg = ok
      ? "{green-fg}✓ sincronizado{/green-fg}"
      : "{red-fg}✗ erro ao sincronizar{/red-fg}";
    syncFlash.setContent(msg);
    syncFlash.show();
    screen.render();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncFlash.hide(); screen.render(); }, 2500);
  }

  async function doRefresh() {
    if (mode === "detail") return; // don't disrupt detail view mid-read
    try {
      const { columns: newCols, cardsByColumn: newCards } = await onRefresh();
      // Clamp cursor in case issues were removed
      colIdx  = Math.min(colIdx, Math.max(0, newCols.length - 1));
      const newColCards = newCards[newCols[colIdx]?.id] || [];
      cardIdx = Math.min(cardIdx, Math.max(0, newColCards.length - 1));

      columns       = newCols;
      cardsByColumn = newCards;
      lastSync      = new Date();
      flashSync(true);
    } catch {
      flashSync(false);
    }
    if (mode !== "detail") refresh();
  }

  function schedulePoll() {
    clearInterval(pollTimer);
    pollTimer = setInterval(doRefresh, POLL_MS);
  }

  // ─── keybindings ─────────────────────────────────────────────────────────────
  screen.key(["q", "C-c"], () => {
    clearInterval(pollTimer);
    clearTimeout(syncTimer);
    screen.destroy();
    process.exit(0);
  });

  screen.key(["escape"], () => {
    if (mode === "detail") hideDetail();
  });

  screen.key(["enter"], () => {
    if (mode === "board") showDetail();
  });

  screen.key(["r"], () => {
    if (mode === "board") {
      renderStatusBar("{cyan-fg}↻ atualizando…{/cyan-fg}");
      screen.render();
      doRefresh();
    }
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
    if (mode === "detail") { detailBox.scroll(-3); screen.render(); return; }
    if (cardIdx > 0) { cardIdx--; refresh(); }
  });

  screen.key(["down", "j"], () => {
    if (mode === "detail") { detailBox.scroll(3); screen.render(); return; }
    const cards = cardsByColumn[columns[colIdx]?.id] || [];
    if (cardIdx < cards.length - 1) { cardIdx++; refresh(); }
  });

  screen.on("resize", () => {
    if (mode === "detail") {
      detailBox.width  = screen.width - SIDEBAR_W - 2;
      detailBox.height = screen.height - 4;
    }
    refresh();
  });

  // ─── main render loop ─────────────────────────────────────────────────────────
  function refresh() {
    renderSidebar();
    buildColumns();
    renderStatusBar();
    screen.render();
  }

  refresh();
  schedulePoll();
}
