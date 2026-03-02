const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");
const { sendSms } = require("../services/sms");
const { sendEmail } = require("../services/email");
const ManualCode = require("../models/ManualCode");

// POST /api/verify/phone/start { phone }
// Generates OTP and sends it via SMS (Twilio).
router.post("/phone/start", auth, async (req, res) => {
  try {
    const phone = String(req.body.phone || "").trim();
    if (!phone) return res.status(400).json({ message: "Phone number is required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // simple rate limit: 1 send per 30 seconds
    const now = new Date();
    if (user.phoneOtp?.lastSentAt && (now - user.phoneOtp.lastSentAt) < 30_000) {
      return res.status(429).json({ message: "Please wait a moment before requesting another OTP." });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(otp, 10);

    user.phone.number = phone;
    user.phoneOtp = {
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      lastSentAt: now,
    };
    await user.save();

    // Send SMS via provider
    try {
      await sendSms(phone, `Your BaseMarket OTP is ${otp}. It expires in 10 minutes.`);
    } catch (smsErr) {
      // rollback OTP fields to avoid "phantom" OTPs when SMS fails
      user.phoneOtp = { codeHash: "", expiresAt: null, lastSentAt: null };
      await user.save();
      return res.status(500).json({ message: smsErr.message || "Failed to send OTP" });
    }

    res.json({ message: "OTP sent" });
  } catch (e) {
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

// POST /api/verify/phone/confirm { phone, otp }
router.post("/phone/confirm", auth, async (req, res) => {
  try {
    const phone = String(req.body.phone || "").trim();
    const otp = String(req.body.otp || "").trim();
    if (!phone || !otp) return res.status(400).json({ message: "Phone and OTP are required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.phoneOtp?.codeHash || !user.phoneOtp?.expiresAt) {
      return res.status(400).json({ message: "Request an OTP first." });
    }
    if (user.phoneOtp.expiresAt < new Date()) {
      return res.status(400).json({ message: "OTP expired. Request a new one." });
    }
    if (String(user.phone.number || "") !== phone) {
      return res.status(400).json({ message: "Phone number does not match the OTP request." });
    }

    const ok = await bcrypt.compare(otp, user.phoneOtp.codeHash);
    if (!ok) return res.status(400).json({ message: "Incorrect OTP." });

    user.phone.verified = true;
    user.phoneOtp = { codeHash: "", expiresAt: null, lastSentAt: null };
    await user.save();

    res.json({
      message: "Phone verified",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        seller: user.seller,
      }
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to verify OTP" });
  }
});


// POST /api/verify/email/start
// Sends a 6-digit OTP to the logged-in user's email address.
router.post("/email/start", auth, async (req, res) => {
  console.log("EMAIL OTP START:", { userId: req.user?.id, time: new Date().toISOString() });
console.log("SMTP CONFIG:", {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  user: process.env.SMTP_USER
});
  try {
    const user = await User.findById(req.user.id).select("email emailOtp");
    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();
    if (user.emailOtp?.lastSentAt && (now - user.emailOtp.lastSentAt) < 30_000) {
      return res.status(429).json({ message: "Please wait a moment before requesting another OTP." });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(otp, 10);

    user.emailOtp = {
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lastSentAt: now,
    };
    await user.save();

    try {
      await sendEmail(
        user.email,
        "Your BaseMarket verification code",
        `Your BaseMarket verification code is ${otp}. It expires in 10 minutes.`
      );
    } catch (mailErr) {

      user.emailOtp = { codeHash: "", expiresAt: null, lastSentAt: null };
      await user.save();
      return res.status(500).json({ message: mailErr.message || "Failed to send email OTP" });
      console.error("EMAIL OTP ERROR FULL:", mailErr);
    }

    res.json({ message: "OTP sent to your email" });
  } catch (e) {
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

// POST /api/verify/email/confirm { otp }
router.post("/email/confirm", auth, async (req, res) => {
  try {
    const otp = String(req.body.otp || "").trim();
    if (!otp) return res.status(400).json({ message: "OTP is required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.emailOtp?.codeHash || !user.emailOtp?.expiresAt) {
      return res.status(400).json({ message: "Request an OTP first." });
    }
    if (user.emailOtp.expiresAt < new Date()) {
      return res.status(400).json({ message: "OTP expired. Request a new one." });
    }

    const ok = await bcrypt.compare(otp, user.emailOtp.codeHash);
    if (!ok) return res.status(400).json({ message: "Incorrect OTP." });

    user.emailVerified = true;
    user.verifiedAt = new Date();
    user.emailOtp = { codeHash: "", expiresAt: null, lastSentAt: null };
    await user.save();

    res.json({
      message: "Email verified",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        phone: user.phone,
        seller: user.seller,
        verifiedAt: user.verifiedAt,
      }
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to verify OTP" });
  }
});

// Admin-only: POST /api/verify/manual/generate { daysValid }
router.post("/manual/generate", async (req, res) => {
  try {
    const adminKey = String(req.headers["x-admin-key"] || "");
    if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const days = Number(req.body.daysValid || 30);
    const code = "BM-" + Math.random().toString(36).slice(2, 8).toUpperCase();

    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const doc = await ManualCode.create({ codeHash, expiresAt });
    res.json({ code, expiresAt: doc.expiresAt });
  } catch (e) {
    res.status(500).json({ message: "Failed to generate code" });
  }
});

// Logged-in user: POST /api/verify/manual/redeem { code }
router.post("/manual/redeem", auth, async (req, res) => {
  try {
    const code = String(req.body.code || "").trim();
    if (!code) return res.status(400).json({ message: "Code is required" });

    const now = new Date();
    const candidates = await ManualCode.find({
      usedAt: null,
      expiresAt: { $gt: now }
    }).limit(50);

    let match = null;
    for (const c of candidates) {
      const ok = await bcrypt.compare(code, c.codeHash);
      if (ok) { match = c; break; }
    }

    if (!match) return res.status(400).json({ message: "Invalid or expired code" });

    match.usedAt = new Date();
    match.usedBy = req.user.id;
    await match.save();

    const user = await User.findById(req.user.id);
    user.emailVerified = true;
    user.verifiedAt = new Date();
    await user.save();

    res.json({
      message: "Verified",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        phone: user.phone,
        seller: user.seller,
        verifiedAt: user.verifiedAt,
      }
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to redeem code" });
  }
});

// POST /api/verify/seller/submit { fullname, area }
router.post("/seller/submit", auth, async (req, res) => {
  try {
    const fullname = String(req.body.fullname || "").trim();
    const area = String(req.body.area || "").trim();
    if (!fullname || !area) return res.status(400).json({ message: "Full name and area are required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.seller.status = "pending";
    user.seller.fullname = fullname;
    user.seller.area = area;
    user.seller.submittedAt = new Date();
    await user.save();

    res.json({
      message: "Submitted",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        seller: user.seller,
      }
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to submit" });
  }
});

// GET /api/verify/me
router.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("name email emailVerified verifiedAt phone seller");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

module.exports = router;
