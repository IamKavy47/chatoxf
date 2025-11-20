import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/* ===========================================================
   SEND MESSAGE (supports reply)
   =========================================================== */
export const sendPrivateMessage = mutation({
  args: {
    senderId: v.id("users"),
    receiverId: v.id("users"),
    body: v.string(),
    replyToId: v.optional(v.id("private_messages")),
  },
  handler: async (ctx, { senderId, receiverId, body, replyToId }) => {
    // Convex does NOT allow null → convert to undefined
    const normalizedReply = replyToId ?? undefined;

    await ctx.db.insert("private_messages", {
      senderId,
      receiverId,
      body,
      timestamp: Date.now(),

      replyToId: normalizedReply,
      reactions: undefined, // empty reactions must be undefined
      deletedFor: undefined,
    });

    /* THREAD UPDATE */
    const thread = await ctx.db
      .query("chat_threads")
      .filter(q =>
        q.or(
          q.and(q.eq(q.field("userA"), senderId), q.eq(q.field("userB"), receiverId)),
          q.and(q.eq(q.field("userA"), receiverId), q.eq(q.field("userB"), senderId))
        )
      )
      .unique();

    if (!thread) {
      await ctx.db.insert("chat_threads", {
        userA: senderId,
        userB: receiverId,
        lastMsg: body,
        lastTime: Date.now(),
        unreadA: 0,
        unreadB: 1,
      });
    } else {
      const isReceiverUserA = thread.userA === receiverId;

      const patch = {
        lastMsg: body,
        lastTime: Date.now(),
        unreadA: thread.unreadA,
        unreadB: thread.unreadB,
      };

      if (isReceiverUserA) patch.unreadA++; else patch.unreadB++;

      await ctx.db.patch(thread._id, patch);
    }
  },
});

/* ===========================================================
   GET PRIVATE MESSAGES (with replies & delete-for-me)
   =========================================================== */
export const getPrivateMessages = query({
  args: { senderId: v.id("users"), receiverId: v.id("users") },
  handler: async (ctx, { senderId, receiverId }) => {
    // Messages the user deleted
    const deleted = await ctx.db
      .query("deleted_messages")
      .filter(q => q.eq(q.field("userId"), senderId))
      .collect();

    const deletedSet = new Set(deleted.map(d => d.messageId));

    // Pull all messages
    const msgs = await ctx.db
      .query("private_messages")
      .filter(q =>
        q.or(
          q.and(q.eq(q.field("senderId"), senderId), q.eq(q.field("receiverId"), receiverId)),
          q.and(q.eq(q.field("senderId"), receiverId), q.eq(q.field("receiverId"), senderId))
        )
      )
      .order("asc")
      .collect();

    const final = [];

    for (const msg of msgs) {
      // Delete-for-me hide
      if (deletedSet.has(msg._id)) continue;

     // Load enriched reply object (with sender name + username)
let reply = null;

if (msg.replyToId) {
  const repliedMsg = await ctx.db.get(msg.replyToId);

  if (repliedMsg) {
    const repliedUser = await ctx.db.get(repliedMsg.senderId);

    reply = {
      _id: repliedMsg._id,
      body: repliedMsg.body,
      senderId: repliedMsg.senderId,
      senderName: repliedUser?.name || null,
      senderUsername: repliedUser?.username || null,
      timestamp: repliedMsg.timestamp,
    };
  }
}


      final.push({
        ...msg,
        replyTo: reply,
      });
    }

    return final;
  },
});

/* ===========================================================
   MARK THREAD READ
   =========================================================== */
export const markThreadRead = mutation({
  args: { userId: v.id("users"), otherId: v.id("users") },
  handler: async (ctx, { userId, otherId }) => {
    const thread = await ctx.db
      .query("chat_threads")
      .filter(q =>
        q.or(
          q.and(q.eq(q.field("userA"), userId), q.eq(q.field("userB"), otherId)),
          q.and(q.eq(q.field("userA"), otherId), q.eq(q.field("userB"), userId))
        )
      )
      .unique();

    if (!thread) return;

    const patch = {
      unreadA: thread.unreadA,
      unreadB: thread.unreadB,
    };

    if (thread.userA === userId) patch.unreadA = 0;
    else patch.unreadB = 0;

    await ctx.db.patch(thread._id, patch);
  },
});

/* ===========================================================
   REACT TO MESSAGE
   =========================================================== */
export const reactMessage = mutation({
  args: {
    messageId: v.id("private_messages"),
    userId: v.id("users"),
    emoji: v.string(),
  },
  handler: async (ctx, { messageId, userId, emoji }) => {
    const msg = await ctx.db.get(messageId);
    if (!msg) return;

    const reactions = msg.reactions ? { ...msg.reactions } : {};

    // Convert ID to string for indexing
    const key = String(userId);

    if (reactions[key] === emoji) {
      delete reactions[key];
    } else {
      reactions[key] = emoji;
    }

    await ctx.db.patch(messageId, {
      reactions: Object.keys(reactions).length ? reactions : undefined,
    });
  },
});


/* ===========================================================
   DELETE MESSAGE
   =========================================================== */
export const deleteMessage = mutation({
  args: {
    messageId: v.id("private_messages"),
    userId: v.id("users"),
    forEveryone: v.boolean(),
  },
  handler: async (ctx, { messageId, userId, forEveryone }) => {
    const msg = await ctx.db.get(messageId);
    if (!msg) return;

    // Delete for everyone (sender only)
    if (forEveryone) {
      if (msg.senderId !== userId) return;
      await ctx.db.delete(messageId);
      return;
    }

    // Delete just for me
    await ctx.db.insert("deleted_messages", {
      userId,
      messageId,
    });
  },
});

/* ===========================================================
   CLEAR FULL CHAT
   =========================================================== */
export const clearThread = mutation({
  args: {
    userA: v.id("users"),
    userB: v.id("users"),
  },
  handler: async (ctx, { userA, userB }) => {
    const allMsgs = await ctx.db
      .query("private_messages")
      .filter(q =>
        q.or(
          q.and(q.eq(q.field("senderId"), userA), q.eq(q.field("receiverId"), userB)),
          q.and(q.eq(q.field("senderId"), userB), q.eq(q.field("receiverId"), userA))
        )
      )
      .collect();

    for (const m of allMsgs) {
      await ctx.db.insert("deleted_messages", {
        userId: userA,
        messageId: m._id,
      });
    }
  },
});
