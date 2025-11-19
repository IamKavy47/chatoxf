import { Resend } from "resend";

export default async function handler(req, res) {
  // ---- CORS FIX ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let { email, otp } = req.body;

  // Validate fields
  if (!email || otp == null) {
    return res.status(400).json({ error: "Email and OTP required" });
  }

  // Normalize OTP into a string in ALL cases
  otp = String(
    typeof otp === "object" && otp?.otp
      ? otp.otp
      : otp
  );

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: "OmniXForge <onboarding@resend.dev>",
      to: email,
      subject: "Your OmniXForge OTP Code",
      html: `
        <div style="padding:20px; font-family:sans-serif;">
          <h2 style="color:#5b6cff;">OmniXForge Verification</h2>
          <p>Your one-time password:</p>
          <h1 style="font-size:32px; font-weight:bold;">${otp}</h1>
          <p>This code expires in 5 minutes.</p>
        </div>
      `
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("Resend Error:", error);
    return res.json({ ok: false, error: error.message });
  }
}
