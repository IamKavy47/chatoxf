import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    email: v.string(),
    name: v.string(),
    password: v.string(),

    // allow empty (undefined) or true PFP id
    profilePic: v.optional(v.id("_storage")),

    // new about section
    about: v.optional(v.string()),

    createdAt: v.number(),
  }),
  
  private_messages: defineTable({
    senderId: v.id("users"),
    receiverId: v.id("users"),
    body: v.string(),
    timestamp: v.number(),
  }),

  chat_threads: defineTable({
    userA: v.id("users"),
    userB: v.id("users"),
    lastMsg: v.string(),
    lastTime: v.number(),
    unreadA: v.number(),
    unreadB: v.number(),
  }),

  // optional global chat
  messages: defineTable({
    author: v.string(),
    body: v.string(),
    timestamp: v.number(),
  }),

  otp: defineTable({
  email: v.string(),
  otp: v.string(),
  purpose: v.optional(v.string()),  // ✅ optional
  expires: v.number()
})
  .index("by_email", ["email"])
  .index("by_purpose", ["purpose"])
  .index("by_email_purpose", ["email", "purpose"]),

});
