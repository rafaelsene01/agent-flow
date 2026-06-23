export function boardSlug(board) {
  if (board.slug) return board.slug;
  const repo = board.viewFilter?.match(/repo:([^\s]+)/i)?.[1] ?? "";
  const base = repo ? repo.split("/").pop() : board.name;
  return base.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
