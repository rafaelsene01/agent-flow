export function boardSlug(board) {
  if (board.slug) return board.slug;
  const base = board.repoName
    ? board.repoName.split("/").pop()
    : board.name;
  return base.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
