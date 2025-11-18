require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// email sender setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// send OTP route
app.post("/send-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    await transporter.sendMail({
      from: `OmniXForge <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OmniXForge Chat OTP Code",
      html: `
      <div style="padding:20px; font-family:sans-serif;">
        <h2 style="color:#5b6cff;">OmniXForge Verification Code</h2>
        <p>Your one-time password:</p>
        <h1 style="font-size:32px; font-weight:bold;">${otp}</h1>
        <p>This code expires in 5 minutes.</p>
        <p style="color:#888">Team OmniXForge</p>
      </div>`
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, error: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log("OTP server running on port " + PORT));
