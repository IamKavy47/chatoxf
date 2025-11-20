"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import fetch from "node-fetch";

export const callAI = action({
  args: {
    text: v.string(),
  },
  handler: async (_, { text }) => {
    const A4F_KEY = "ddc-a4f-af56861e964e43debe8a499a8e41b578";

    const res = await fetch("https://api.a4f.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${A4F_KEY}`,
      },
      body: JSON.stringify({
        model: "provider-5/gpt-4o-mini",
        messages: [
          { role: "system", content: "You are ChatOXF AI." },
          { role: "user", content: text },
        ],
      }),
    });

    const json: any = await res.json();

    return (
      json?.choices?.[0]?.message?.content ||
      json?.choices?.[0]?.text ||
      "AI unavailable."
    );
  },
});
