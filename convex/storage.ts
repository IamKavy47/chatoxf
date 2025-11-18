import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Step 1: Generate upload URL
export const getUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

// Step 2: Save storageId to user profile
export const savePFP = mutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { userId, storageId }) => {
    await ctx.db.patch(userId, { profilePic: storageId });
  },
});

// Step 3: Get public URL to display image
export const getPFPUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});
