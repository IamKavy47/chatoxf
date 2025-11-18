import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getMessages = query({
  args: {},
  handler: async (ctx) => {
    const msgs = await ctx.db
      .query("messages")
      .order("desc")
      .take(50);
    return msgs.reverse();
  },
});

export const sendMessage = mutation({
  args: {
    author: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      author: args.author,
      body: args.body,
      timestamp: Date.now(),
    });
  },
});
