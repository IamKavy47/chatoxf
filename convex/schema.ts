// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  /* ============================
        USERS TABLE
  ============================ */
  users: defineTable({
    username: v.string(),
    email: v.string(),
    name: v.string(),
    password: v.string(),

    profilePic: v.optional(v.id("_storage")),
    about: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_username", ["username"])
    .index("by_email", ["email"]),


  /* ============================
        PRIVATE MESSAGES  
        (Replies + Reactions + Delete)
  ============================ */
  private_messages: defineTable({
    senderId: v.id("users"),
    receiverId: v.id("users"),
    body: v.string(),
    timestamp: v.number(),

    // Replies
    replyToId: v.optional(v.id("private_messages")),

    // Reactions (dynamic userId → emoji)
    reactions: v.optional(v.record(v.string(), v.string())),

    // Delete options
    deleted: v.optional(v.boolean()),               // delete-for-everyone
    deletedFor: v.optional(v.array(v.id("users")))  // delete-for-me
  })
    .index("by_pair", ["senderId", "receiverId"])
    .index("reverse_pair", ["receiverId", "senderId"]),


  /* ============================
        CHAT THREADS
  ============================ */
  chat_threads: defineTable({
    userA: v.id("users"),
    userB: v.id("users"),
    lastMsg: v.string(),
    lastTime: v.number(),

    unreadA: v.number(),
    unreadB: v.number(),
  })
    .index("by_users", ["userA", "userB"])
    .index("by_users_reverse", ["userB", "userA"]),


  /* ============================
        GLOBAL CHAT (Optional)
  ============================ */
  messages: defineTable({
    author: v.string(),
    body: v.string(),
    timestamp: v.number(),
  }),


  /* ============================
        OTP TABLE
  ============================ */
  otp: defineTable({
    email: v.string(),
    otp: v.string(),
    purpose: v.optional(v.string()),
    expires: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_purpose", ["purpose"])
    .index("by_email_purpose", ["email", "purpose"]),


  /* ============================
        DELETED MESSAGES TRACKER
  ============================ */
  deleted_messages: defineTable({
    userId: v.id("users"),
    messageId: v.id("private_messages"),
  })
    .index("by_user", ["userId"])
    .index("by_message", ["messageId"]),
});
