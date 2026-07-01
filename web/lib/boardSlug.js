export function boardSlug(board) {
  if (board.slug) return board.slug;
  const repo = board.viewFilter?.match(/repo:([^\s]+)/i)?.[1] ?? "";
  const base = repo ? repo.split("/").pop() : board.name;
  return base.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// Resolve o board da rota /board/<slug>. Retorna null para qualquer outra rota
// (home, /agent, /skill, /board) ou quando o slug não casa com nenhum board.
export function boardFromPath(boards, path) {
  if (!path.startsWith("/board/")) return null;
  const slug = path.slice("/board/".length);
  return boards.find((b) => boardSlug(b) === slug) ?? null;
}
