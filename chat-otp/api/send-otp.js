import nodemailer from "nodemailer";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method Not Allowed" });

  const { email, otp } = req.body;

  if (!email || !otp)
    return res.status(400).json({ error: "Email + OTP required" });

  // Gmail SMTP transport
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,       // your Gmail
      pass: process.env.MAIL_PASS,       // 16-digit app password
    },
  });

  try {
    await transporter.sendMail({
      from: `"OmniXForge" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Your OmniXForge OTP Code",
      html: `
        <div style="padding:20px; font-family:sans-serif;">
          <h2 style="color:#5b6cff;">OmniXForge Verification</h2>
          <p>Your one-time password:</p>
          <h1 style="font-size:32px; font-weight:bold;">${otp}</h1>
          <p>This code expires in 5 minutes.</p>
        </div>
      `,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.log("EMAIL ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
