import { Resend } from "resend";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP required" });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: "OmniXForge <onboarding@resend.dev>",
      to: email,
      subject: "Your OmniXForge Chat OTP Code",
      html: `
      <div style="padding:20px; font-family:sans-serif;">
        <h2 style="color:#5b6cff;">OmniXForge Verification Code</h2>
        <p>Your one-time password:</p>
        <h1 style="font-size:32px; font-weight:bold;">${otp}</h1>
        <p>This code expires in 5 minutes.</p>
        <p style="color:#888">Team OmniXForge</p>
      </div>
      `
    });

    return res.json({ ok: true });

  } catch (err) {
    console.error("Email error:", err);
    return res.json({ ok: false, error: err.message });
  }
}
