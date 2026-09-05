import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type Room = NonNullable<FunctionReturnType<typeof api.games.get>>;
export type BeadColor = Room["currentColor"];
export type Cell = Room["board"][number];
export type Position = Pick<Room, "board" | "status" | "currentColor" | "winner" | "winningLine">;

export const SIZE = 4;
export const COLUMNS = 16;
export const WOOD_NAMES = { ember: "Maple", cobalt: "Walnut" };
export const COLUMN_LABELS = Array.from(
  { length: COLUMNS },
  (_, column) => `${String.fromCharCode(65 + Math.floor(column / SIZE))}${(column % SIZE) + 1}`,
);

export function columnCells(board: readonly Cell[], column: number) {
  return Array.from({ length: SIZE }, (_, level) => board[level * COLUMNS + column]);
}

export function describeColumn(
  board: readonly Cell[],
  column: number,
  color: BeadColor,
  canDrop: boolean,
) {
  const cells = columnCells(board, column);
  const level = cells.indexOf(null);
  const stack = cells.filter((cell) => cell !== null).map((cell) => WOOD_NAMES[cell]);
  const contents = stack.length ? `bottom to top: ${stack.join(", ")}` : "empty";
  const action =
    level === -1
      ? "full"
      : canDrop
        ? `drop ${WOOD_NAMES[color]} at level ${level + 1}`
        : "cannot play now";
  return `${COLUMN_LABELS[column]}, ${contents}; ${action}`;
}

export function emptyPosition(): Position {
  return {
    board: Array<Cell>(64).fill(null),
    status: "playing",
    currentColor: "ember",
    winner: null,
    winningLine: null,
  };
}

export const WINNING_LINES: number[][] = [];
for (let dz = -1; dz <= 1; dz++) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dz || dy || dx) <= 0) continue;
      for (let z = 0; z < SIZE; z++) {
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            const end = [x + 3 * dx, y + 3 * dy, z + 3 * dz];
            if (end.some((coordinate) => coordinate < 0 || coordinate >= SIZE)) continue;
            WINNING_LINES.push(
              Array.from(
                { length: SIZE },
                (_, step) => (z + step * dz) * COLUMNS + (y + step * dy) * SIZE + x + step * dx,
              ),
            );
          }
        }
      }
    }
  }
}

export function playLocalMove(position: Position, column: number): Position {
  if (position.status !== "playing") throw new Error("This round is over.");
  if (!Number.isInteger(column) || column < 0 || column >= COLUMNS)
    throw new Error("Choose a peg on the board.");
  const level = columnCells(position.board, column).indexOf(null);
  if (level === -1) throw new Error("That peg is full.");
  const board = [...position.board];
  board[level * COLUMNS + column] = position.currentColor;
  const winningLine =
    WINNING_LINES.find((line) => line.every((index) => board[index] === position.currentColor)) ??
    null;
  const status = winningLine ? "won" : board.every((cell) => cell !== null) ? "draw" : "playing";
  return {
    board,
    status,
    currentColor:
      status === "playing"
        ? position.currentColor === "ember"
          ? "cobalt"
          : "ember"
        : position.currentColor,
    winner: winningLine ? position.currentColor : null,
    winningLine,
  };
}

export const PREVIEW_BOARD: Cell[] = Array<Cell>(64).fill(null);
const previewStacks: BeadColor[][] = [
  ["cobalt", "ember", "cobalt"],
  ["ember", "cobalt"],
  ["ember", "ember", "cobalt", "ember"],
  ["cobalt", "ember"],
  ["ember", "ember"],
  ["cobalt", "ember", "cobalt"],
  ["cobalt", "cobalt", "ember"],
  ["ember"],
  ["cobalt", "ember", "ember", "cobalt"],
  ["ember", "cobalt"],
  ["ember", "cobalt", "ember"],
  ["cobalt", "cobalt", "ember"],
  ["cobalt", "ember", "ember"],
  ["cobalt", "cobalt"],
  ["ember", "cobalt", "ember", "ember"],
  ["cobalt", "ember"],
];
previewStacks.forEach((stack, column) =>
  stack.forEach((color, level) => {
    PREVIEW_BOARD[level * COLUMNS + column] = color;
  }),
);
