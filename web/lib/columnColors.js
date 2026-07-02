// Cores das colunas do GitHub Projects (nome do option -> hex). Compartilhado
// entre o Board (colunas) e a listagem de boards (contagem por coluna).
export const GH_COLORS = {
  GRAY: "#7d8590",
  BLUE: "#58a6ff",
  GREEN: "#3fb950",
  YELLOW: "#e3b341",
  ORANGE: "#fb8f44",
  RED: "#f85149",
  PINK: "#f778ba",
  PURPLE: "#bf68d9",
};

export function columnAccent(color) {
  return GH_COLORS[color] ?? GH_COLORS.GRAY;
}
