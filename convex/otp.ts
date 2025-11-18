import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const requestOtp = mutation({
  args: { email: v.string(), purpose: v.optional(v.string()) },
  handler: async (ctx, { email, purpose }) => {
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    await ctx.db.insert("otp", {
      email,
      otp,
      purpose,
      expires: Date.now() + 5 * 60 * 1000,
    });

    return otp;
  },
});


export const verifyOtp = query({
  args: {
    email: v.string(),
    otp: v.string(),
    purpose: v.string(),
  },
  handler: async (ctx, { email, otp, purpose }) => {
    const record = await ctx.db
      .query("otp")
      .filter(q =>
        q.and(
          q.eq(q.field("email"), email),
          q.eq(q.field("purpose"), purpose)
        )
      )
      .order("desc")
      .first();

    if (!record) return false;
    if (record.otp !== otp) return false;
    if (Date.now() > record.expires) return false;

    return true;
  },
});
