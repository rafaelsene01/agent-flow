export const initialState = {
  initializing: true,
  boards: [],
};

// Com rotas reais do App Router, a rota ativa e o board ativo vêm do pathname
// (usePathname) — o reducer só cuida da lista de boards e do estado de boot.
export function appReducer(state, action) {
  switch (action.type) {
    case "INIT_DONE":
      return { ...state, initializing: false, boards: action.boards };
    case "BOARD_ADDED":
      return { ...state, boards: [...state.boards, action.board] };
    case "BOARD_UPDATED":
      return {
        ...state,
        boards: state.boards.map((b) => b.viewId === action.board.viewId ? action.board : b),
      };
    case "BOARD_REMOVED":
      return { ...state, boards: state.boards.filter((b) => b.viewId !== action.boardViewId) };
    default:
      return state;
  }
}
