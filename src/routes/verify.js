const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");

// POST /api/verify/phone/start { phone }
// Generates OTP and (for now) logs it to server console.
// TODO: Integrate SMS provider (e.g., Africa's Talking, Twilio, etc.)
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

    console.log("[BaseMarket] OTP for", phone, "=>", otp);

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
  const user = await User.findById(req.user.id).select("name email phone seller");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

module.exports = router;
