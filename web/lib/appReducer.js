export const initialState = {
  initializing: true,
  boards: [],
  activeBoard: null,
  activePath: "/",
};

export function appReducer(state, action) {
  switch (action.type) {
    case "INIT_DONE":
      return {
        ...state,
        initializing: false,
        boards:      action.boards,
        activeBoard: action.activeBoard,
        activePath:  action.activePath,
      };
    case "SELECT_BOARD":
      return { ...state, activeBoard: action.board, activePath: action.path };
    case "BOARD_ADDED":
      return {
        ...state,
        boards:      [...state.boards, action.board],
        activeBoard: action.board,
      };
    case "BOARD_UPDATED":
      return {
        ...state,
        boards:      state.boards.map((b) => b.viewId === action.board.viewId ? action.board : b),
        activeBoard: action.board,
      };
    case "BOARD_REMOVED": {
      const next = state.boards.filter((b) => b.viewId !== action.boardViewId);
      return {
        ...state,
        boards:      next,
        activeBoard: action.fallbackBoard,
        activePath:  action.fallbackPath ?? "/",
      };
    }
    case "SET_PATH":
      return { ...state, activePath: action.path };
    default:
      return state;
  }
}
