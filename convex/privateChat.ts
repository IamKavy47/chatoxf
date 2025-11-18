import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Send private message and update thread
export const sendPrivateMessage = mutation({
  args: {
    senderId: v.id("users"),
    receiverId: v.id("users"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const { senderId, receiverId, body } = args;

    // Insert message
    await ctx.db.insert("private_messages", {
      senderId,
      receiverId,
      body,
      timestamp: Date.now(),
    });

    // Find existing thread
    const thread = await ctx.db
      .query("chat_threads")
      .filter((q) =>
        q.or(
          q.and(
            q.eq(q.field("userA"), senderId),
            q.eq(q.field("userB"), receiverId)
          ),
          q.and(
            q.eq(q.field("userA"), receiverId),
            q.eq(q.field("userB"), senderId)
          )
        )
      )
      .unique();

    if (!thread) {
      // create new thread, set unread for receiver
      await ctx.db.insert("chat_threads", {
        userA: senderId,
        userB: receiverId,
        lastMsg: body,
        lastTime: Date.now(),
        unreadA: 0,
        unreadB: 1,
      });
    } else {
      // update last message and increment unread for receiver
      const isReceiverUserA = thread.userA === receiverId;
      const patchObj: any = {
        lastMsg: body,
        lastTime: Date.now(),
      };
      patchObj.unreadA = thread.unreadA;
      patchObj.unreadB = thread.unreadB;

      if (isReceiverUserA) patchObj.unreadA = thread.unreadA + 1;
      else patchObj.unreadB = thread.unreadB + 1;

      await ctx.db.patch(thread._id, patchObj);
    }
  },
});

// Get private messages between two users (last 100)
export const getPrivateMessages = query({
  args: { senderId: v.id("users"), receiverId: v.id("users") },
  handler: async (ctx, { senderId, receiverId }) => {
    const msgs = await ctx.db
      .query("private_messages")
      .order("desc")
      .filter((q) =>
        q.or(
          q.and(
            q.eq(q.field("senderId"), senderId),
            q.eq(q.field("receiverId"), receiverId)
          ),
          q.and(
            q.eq(q.field("senderId"), receiverId),
            q.eq(q.field("receiverId"), senderId)
          )
        )
      )
      .take(100);

    return msgs.reverse();
  },
});

// Mark thread as read for a user (set unread to 0)
export const markThreadRead = mutation({
  args: { userId: v.id("users"), otherId: v.id("users") },
  handler: async (ctx, { userId, otherId }) => {
    const thread = await ctx.db
      .query("chat_threads")
      .filter((q) =>
        q.or(
          q.and(q.eq(q.field("userA"), userId), q.eq(q.field("userB"), otherId)),
          q.and(q.eq(q.field("userA"), otherId), q.eq(q.field("userB"), userId))
        )
      )
      .unique();

    if (!thread) return;

    const isUserA = thread.userA === userId;
    const patchObj: any = {};
    patchObj.unreadA = thread.unreadA;
    patchObj.unreadB = thread.unreadB;
    if (isUserA) patchObj.unreadA = 0;
    else patchObj.unreadB = 0;

    await ctx.db.patch(thread._id, patchObj);
  },
});
