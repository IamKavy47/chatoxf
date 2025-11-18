import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Helper: ArrayBuffer -> hex
function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string) {
  const encoded = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(hashBuffer);
}

// Register
export const register = mutation({
  args: {
    username: v.string(),
    email: v.string(),
    name: v.string(),
    password: v.string(),
    profilePic: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("username"), args.username))
      .unique();
    if (existingUser) throw new Error("Username already exists");

    const existingEmail = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), args.email))
      .unique();
    if (existingEmail) throw new Error("Email already exists");

    const hashed = await hashPassword(args.password);

    return await ctx.db.insert("users", {
      username: args.username,
      email: args.email,
      name: args.name,
      password: hashed,
      profilePic: undefined,   // FIXED
      about: "",               // NEW FIELD INITIALIZATION
      createdAt: Date.now(),
    });
  },
});



// Login
export const login = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("username"), args.username))
      .unique();
    if (!user) throw new Error("User not found");

    const hashed = await hashPassword(args.password);
    if (hashed !== user.password) throw new Error("Wrong password");

    return user;
  },
});

// Search user by exact username
export const searchUser = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("username"), args.username))
      .unique();
  },
});

// Fetch a user's public profile (including storage id) by id
export const getUserById = query({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    username: v.string(),
    about: v.string(),
  },
  handler: async (ctx, { userId, name, username, about }) => {
    // Check username availability first
    const existing = await ctx.db
      .query("users")
      .filter(q => q.eq(q.field("username"), username))
      .unique();

    if (existing && existing._id !== userId) {
      throw new Error("Username already taken");
    }

    await ctx.db.patch(userId, {
      name,
      username,
      about,
    });
  },
});

export const removePFP = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, { profilePic: undefined });
  },
});

export const getPublicProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    if (!u) return null;

    return {
      _id: u._id,
      name: u.name,
      username: u.username,
      about: u.about ?? "",
      profilePic: u.profilePic ?? null,
    };
  },
});

export const isUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const u = await ctx.db
      .query("users")
      .filter(q => q.eq(q.field("username"), username))
      .unique();

    return !u; // true = available
  },
});


