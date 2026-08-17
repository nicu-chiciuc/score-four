import { getAuthUserId } from "@convex-dev/auth/server";
import type { Auth } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

type Color = "ember" | "cobalt";
type Cell = Color | null;
type Game = Doc<"games">;

const BOARD_SIZE = 4;
const COLUMN_COUNT = BOARD_SIZE * BOARD_SIZE;
const BOARD_CELL_COUNT = COLUMN_COUNT * BOARD_SIZE;
const ROOM_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const colorValidator = v.union(v.literal("ember"), v.literal("cobalt"));
const gameResultValidator = v.union(
  v.null(),
  v.object({
    roomKey: v.string(),
    board: v.array(v.union(v.null(), colorValidator)),
    players: v.array(
      v.object({
        name: v.string(),
        color: colorValidator,
        isViewer: v.boolean(),
      }),
    ),
    status: v.union(
      v.literal("waiting"),
      v.literal("playing"),
      v.literal("won"),
      v.literal("draw"),
    ),
    currentColor: colorValidator,
    winner: v.union(colorValidator, v.null()),
    winningLine: v.union(v.array(v.number()), v.null()),
  }),
);
const roomResultValidator = v.object({
  roomKey: v.string(),
  color: colorValidator,
});

const DIRECTIONS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, -1, 0],
  [1, 0, 1],
  [1, 0, -1],
  [0, 1, 1],
  [0, 1, -1],
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [1, -1, -1],
] as const;

function boardIndex(x: number, y: number, z: number) {
  return z * COLUMN_COUNT + y * BOARD_SIZE + x;
}

function buildWinningLines() {
  const lines: number[][] = [];

  for (let z = 0; z < BOARD_SIZE; z += 1) {
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        for (const [dx, dy, dz] of DIRECTIONS) {
          const endX = x + dx * (BOARD_SIZE - 1);
          const endY = y + dy * (BOARD_SIZE - 1);
          const endZ = z + dz * (BOARD_SIZE - 1);
          if (
            endX < 0 ||
            endX >= BOARD_SIZE ||
            endY < 0 ||
            endY >= BOARD_SIZE ||
            endZ < 0 ||
            endZ >= BOARD_SIZE
          ) {
            continue;
          }

          lines.push(
            Array.from({ length: BOARD_SIZE }, (_, step) =>
              boardIndex(x + dx * step, y + dy * step, z + dz * step),
            ),
          );
        }
      }
    }
  }

  return lines;
}

const WINNING_LINES = buildWinningLines();

function getRequiredUserId(ctx: { auth: Auth }) {
  return getAuthUserId(ctx).then((userId) => {
    if (!userId) {
      throw new Error("Start a guest session before playing");
    }
    return userId;
  });
}

async function getGameByRoomKey(
  ctx: QueryCtx | MutationCtx,
  roomKey: string,
): Promise<Game | null> {
  return await ctx.db
    .query("games")
    .withIndex("by_room_key", (q) => q.eq("roomKey", roomKey))
    .unique();
}

function cleanName(name: string) {
  const trimmedName = name.trim().slice(0, 24);
  return trimmedName || "Guest";
}

function makeRoomKey() {
  let roomKey = "";
  for (let index = 0; index < 8; index += 1) {
    const randomIndex = Math.floor(Math.random() * ROOM_KEY_ALPHABET.length);
    roomKey += ROOM_KEY_ALPHABET[randomIndex];
  }
  return roomKey;
}

function findWinningLine(board: Cell[], color: Color) {
  for (const line of WINNING_LINES) {
    if (line.every((index) => board[index] === color)) {
      return line;
    }
  }
  return null;
}

function emptyBoard(): Cell[] {
  return Array.from({ length: BOARD_CELL_COUNT }, () => null);
}

export const get = query({
  args: {
    roomKey: v.string(),
  },
  returns: gameResultValidator,
  handler: async (ctx, args) => {
    const game = await getGameByRoomKey(ctx, args.roomKey.trim().toUpperCase());
    if (!game) {
      return null;
    }

    const viewerUserId = await getAuthUserId(ctx);
    return {
      roomKey: game.roomKey,
      board: game.board,
      players: game.players.map((player) => ({
        name: player.name,
        color: player.color,
        isViewer: player.userId === viewerUserId,
      })),
      status: game.status,
      currentColor: game.currentColor,
      winner: game.winner,
      winningLine: game.winningLine,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  returns: roomResultValidator,
  handler: async (ctx, args) => {
    const userId = await getRequiredUserId(ctx);
    let roomKey = makeRoomKey();
    let existingGame = await getGameByRoomKey(ctx, roomKey);

    for (let attempt = 0; existingGame && attempt < 5; attempt += 1) {
      roomKey = makeRoomKey();
      existingGame = await getGameByRoomKey(ctx, roomKey);
    }
    if (existingGame) {
      throw new Error("Could not deal a new room. Try again.");
    }

    await ctx.db.insert("games", {
      roomKey,
      board: emptyBoard(),
      players: [
        {
          userId,
          name: cleanName(args.name),
          color: "ember",
        },
      ],
      status: "waiting",
      currentColor: "ember",
      winner: null,
      winningLine: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      roomKey,
      color: "ember" as Color,
    };
  },
});

export const join = mutation({
  args: {
    roomKey: v.string(),
    name: v.string(),
  },
  returns: roomResultValidator,
  handler: async (ctx, args) => {
    const userId = await getRequiredUserId(ctx);
    const roomKey = args.roomKey.trim().toUpperCase();
    const game = await getGameByRoomKey(ctx, roomKey);
    if (!game) {
      throw new Error("That room is not available.");
    }

    const existingPlayer = game.players.find((player) => player.userId === userId);
    if (existingPlayer) {
      const nextName = cleanName(args.name);
      if (nextName !== existingPlayer.name) {
        await ctx.db.patch(game._id, {
          players: game.players.map((player) =>
            player.userId === userId ? { ...player, name: nextName } : player,
          ),
          updatedAt: Date.now(),
        });
      }
      return {
        roomKey,
        color: existingPlayer.color,
      };
    }

    if (game.players.length >= 2) {
      throw new Error("This table already has two players.");
    }

    const color: Color = game.players.some((player) => player.color === "ember")
      ? "cobalt"
      : "ember";
    const players = [
      ...game.players,
      {
        userId,
        name: cleanName(args.name),
        color,
      },
    ];

    await ctx.db.patch(game._id, {
      players,
      status: players.length === 2 ? "playing" : "waiting",
      updatedAt: Date.now(),
    });

    return {
      roomKey,
      color,
    };
  },
});

export const drop = mutation({
  args: {
    roomKey: v.string(),
    column: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getRequiredUserId(ctx);
    const roomKey = args.roomKey.trim().toUpperCase();
    const game = await getGameByRoomKey(ctx, roomKey);
    if (!game) {
      throw new Error("That room is not available.");
    }

    const player = game.players.find((candidate) => candidate.userId === userId);
    if (!player) {
      throw new Error("Join this room before taking a turn.");
    }
    if (game.status === "waiting") {
      throw new Error("Waiting for another player to join.");
    }
    if (game.status !== "playing") {
      throw new Error("This round is over. Deal another board to play again.");
    }
    if (game.currentColor !== player.color) {
      throw new Error("It is not your turn.");
    }
    if (!Number.isInteger(args.column) || args.column < 0 || args.column >= COLUMN_COUNT) {
      throw new Error("Choose a column on the board.");
    }

    const board = [...game.board];
    let z = 0;
    while (
      z < BOARD_SIZE &&
      board[boardIndex(args.column % BOARD_SIZE, Math.floor(args.column / BOARD_SIZE), z)] !== null
    ) {
      z += 1;
    }
    if (z === BOARD_SIZE) {
      throw new Error("That column is full.");
    }

    const x = args.column % BOARD_SIZE;
    const y = Math.floor(args.column / BOARD_SIZE);
    const index = boardIndex(x, y, z);
    board[index] = player.color;
    const winningLine = findWinningLine(board, player.color);
    const boardIsFull = board.every((cell) => cell !== null);
    const status = winningLine ? "won" : boardIsFull ? "draw" : "playing";
    const nextColor = player.color === "ember" ? "cobalt" : "ember";

    await ctx.db.patch(game._id, {
      board,
      status,
      currentColor: winningLine || boardIsFull ? game.currentColor : nextColor,
      winner: winningLine ? player.color : null,
      winningLine,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const reset = mutation({
  args: {
    roomKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getRequiredUserId(ctx);
    const game = await getGameByRoomKey(ctx, args.roomKey.trim().toUpperCase());
    if (!game) {
      throw new Error("That room is not available.");
    }
    if (!game.players.some((player) => player.userId === userId)) {
      throw new Error("Join this room before dealing another board.");
    }

    await ctx.db.patch(game._id, {
      board: emptyBoard(),
      status: game.players.length === 2 ? "playing" : "waiting",
      currentColor: "ember",
      winner: null,
      winningLine: null,
      updatedAt: Date.now(),
    });

    return null;
  },
});
