import { query } from "./_generated/server";
import { v } from "convex/values";

export const getChatList = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const threads = await ctx.db.query("chat_threads").collect();

    const filtered = threads
      .filter((t) => t.userA === userId || t.userB === userId)
      .map((t) => {
        const otherUserId = t.userA === userId ? t.userB : t.userA;
        return {
          threadId: t._id,
          otherUserId,
          lastMsg: t.lastMsg,
          lastTime: t.lastTime,
          unread: t.userA === userId ? t.unreadA : t.unreadB,
        };
      })
      .sort((a, b) => b.lastTime - a.lastTime);

    // fetch other user profiles for each thread (optional: front-end can fetch individually)
    // But to keep simple, return thread objects with otherUserId. Frontend will call users:getUserById and storage:getPFPUrl.
    return filtered;
  },
});
