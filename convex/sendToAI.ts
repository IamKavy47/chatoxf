import { mutation } from "./_generated/server";
import { v } from "convex/values";

const BOT_ID_RAW = "jd7cr4fks47wd1h1kre5k1mnjx7vshhr";

export const saveAIChat = mutation({
  args: {
    userId: v.id("users"),
    text: v.string(),      // FIXED
    aiText: v.string(),
  },

  handler: async (ctx, { userId, text, aiText }) => {
    // normalizeId may return null → validate
    const BOT_ID = ctx.db.normalizeId("users", BOT_ID_RAW);
    if (!BOT_ID) throw new Error("Invalid BOT_ID — verify bot exists.");


    // Store AI reply
    await ctx.db.insert("private_messages", {
      senderId: BOT_ID,
      receiverId: userId,
      body: aiText,
      timestamp: Date.now(),
      reactions: {},
      deletedFor: [],
      replyToId: undefined,
    });

    return { ok: true };
  },
});
