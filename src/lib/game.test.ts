import { describe, expect, it } from "vitest";
import { columnCells, describeColumn, emptyPosition, playLocalMove, WINNING_LINES } from "./game";
import type { Position } from "./game";

describe("Score Four", () => {
  it("enumerates all 76 distinct straight lines, including the four space diagonals", () => {
    expect(WINNING_LINES).toHaveLength(76);
    expect(
      new Set(WINNING_LINES.map((line) => [...line].sort((a, b) => a - b).join(","))).size,
    ).toBe(76);
    expect(WINNING_LINES).toEqual(
      expect.arrayContaining([
        [0, 21, 42, 63],
        [3, 22, 41, 60],
        [12, 25, 38, 51],
        [15, 26, 37, 48],
      ]),
    );
  });

  it("drops under gravity, alternates players and preserves previous positions for undo", () => {
    const first = emptyPosition();
    const second = playLocalMove(first, 5);
    const third = playLocalMove(second, 5);
    expect(columnCells(first.board, 5)).toEqual([null, null, null, null]);
    expect(columnCells(third.board, 5)).toEqual(["ember", "cobalt", null, null]);
    expect(third.currentColor).toBe("ember");
  });

  it("rejects full pegs and invalid coordinates without changing the board", () => {
    let game = emptyPosition();
    for (let count = 0; count < 4; count++) game = playLocalMove(game, 0);
    const snapshot = [...game.board];
    for (const column of [0, -1, 16, 2.5, NaN]) expect(() => playLocalMove(game, column)).toThrow();
    expect(game.board).toEqual(snapshot);
  });

  it("detects a horizontal win and rejects moves after a win", () => {
    let game = emptyPosition();
    for (const column of [0, 4, 1, 5, 2, 6, 3]) game = playLocalMove(game, column);
    expect(game.status).toBe("won");
    expect(game.winner).toBe("ember");
    expect(game.winningLine).toEqual([0, 1, 2, 3]);
    expect(() => playLocalMove(game, 7)).toThrow("This round is over.");
  });

  it("detects a vertical win", () => {
    let game = emptyPosition();
    for (const column of [0, 1, 0, 2, 0, 3, 0]) game = playLocalMove(game, column);
    expect(game.winningLine).toEqual([0, 16, 32, 48]);
  });

  it("detects a space diagonal through four levels", () => {
    const game: Position = emptyPosition();
    for (const index of [0, 21, 42]) game.board[index] = "ember";
    for (const index of [5, 10, 15, 26, 31, 47]) game.board[index] = "cobalt";
    const result = playLocalMove(game, 15);
    expect(result.winningLine).toEqual([0, 21, 42, 63]);
  });

  it("describes the same ordered stack and legal action to keyboard users and agents", () => {
    const game = playLocalMove(playLocalMove(emptyPosition(), 0), 0);
    expect(describeColumn(game.board, 0, "ember", true)).toBe(
      "A1, bottom to top: Maple, Walnut; drop Maple at level 3",
    );
    expect(describeColumn(game.board, 15, "ember", false)).toBe("D4, empty; cannot play now");
  });

  it("ends a full board without a winning line as a draw", () => {
    const game = emptyPosition();
    game.board = "MWMMWMMWMWWWWWWMWMWMMWWMWMMWWMMWMWWWMWMMWMWWMMWMMWMMMWMMWMWMWMWW"
      .split("")
      .map((cell) => (cell === "M" ? "ember" : "cobalt"));
    game.currentColor = "cobalt";
    game.board[63] = null;
    const result = playLocalMove(game, 15);
    expect(result.status).toBe("draw");
    expect(result.winner).toBeNull();
    expect(result.winningLine).toBeNull();
    expect(result.board.every((cell) => cell !== null)).toBe(true);
    expect(() => playLocalMove(result, 0)).toThrow("This round is over.");
  });
});
