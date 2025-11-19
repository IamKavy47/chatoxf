import { Resend } from "resend";

export default async function handler(req, res) {

  // ---- CORS FIX ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store"); // 🔥 IMPORTANT (Cloudflare cache fix)

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  // ------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let { email, otp } = req.body;

  if (!email || otp == null) {
    return res.status(400).json({ error: "Email and OTP required" });
  }

  // 🔥 ALWAYS convert OTP into clean string
  otp = String(
    typeof otp === "object"
      ? otp?.otp ?? otp
      : otp
  ).trim();

  if (otp.length < 4 || otp.length > 8) {
    return res.status(400).json({ error: "Invalid OTP format" });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const result = await resend.emails.send({
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

    // 🔥 If Resend suppressed the email or bounced, we catch it here
    if (!result || result.error) {
      console.error("Resend API Returned Error:", result?.error);
      return res.json({ ok: false, error: result?.error });
    }

    return res.json({ ok: true });

  } catch (error) {
    console.error("Resend Fatal Error:", error);
    return res.json({ ok: false, error: error.message });
  }
}
