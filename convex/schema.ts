import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  todos: defineTable({
    userId: v.id("users"),
    text: v.string(),
    done: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_user_created_at", ["userId", "createdAt"]),
  guestNames: defineTable({
    name: v.string(),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_user", ["userId"]),
  games: defineTable({
    roomKey: v.string(),
    board: v.array(v.union(v.null(), v.literal("ember"), v.literal("cobalt"))),
    players: v.array(
      v.object({
        userId: v.id("users"),
        name: v.string(),
        color: v.union(v.literal("ember"), v.literal("cobalt")),
      }),
    ),
    status: v.union(
      v.literal("waiting"),
      v.literal("playing"),
      v.literal("won"),
      v.literal("draw"),
    ),
    currentColor: v.union(v.literal("ember"), v.literal("cobalt")),
    winner: v.union(v.literal("ember"), v.literal("cobalt"), v.null()),
    winningLine: v.union(v.array(v.number()), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_room_key", ["roomKey"]),
});
