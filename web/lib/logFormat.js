// Colapsa linhas de evento repetidas consecutivas (ex.: "[system/thinking_tokens]")
// numa única linha com contagem ("[system/thinking_tokens]  ×4"), e absorve linhas
// em branco extras. Usado antes de passar o texto do log ao <LogView/> para evitar
// repetição visual. Compartilhado entre o modal do card e o modal de run.
export function collapseLogLines(logText) {
  if (!logText) return "";
  // Casa linhas simples de tipo de evento como [system/thinking_tokens] ou [tool/result]
  const COLLAPSIBLE = /^\[[\w/]+\]$/;
  const lines = logText.split("\n");
  const out = [];
  let lastCollapsible = null; // the line text
  let lastCollapsibleIdx = -1; // its index in out[]
  let count = 0;

  for (const line of lines) {
    if (!line.trim()) {
      // Preserve at most one blank line; absorb extras
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      continue;
    }

    if (COLLAPSIBLE.test(line) && line === lastCollapsible) {
      // Same collapsible line: update the existing entry in-place
      count++;
      out[lastCollapsibleIdx] = `${line}  ×${count}`;
      // Remove the trailing blank that was added after the previous occurrence
      if (out[out.length - 1] === "") out.pop();
    } else {
      out.push(line);
      if (COLLAPSIBLE.test(line)) {
        lastCollapsible = line;
        lastCollapsibleIdx = out.length - 1;
        count = 1;
      } else {
        // Non-collapsible content resets the collapsible tracking
        lastCollapsible = null;
        lastCollapsibleIdx = -1;
        count = 0;
      }
    }
  }

  return out.join("\n");
}
