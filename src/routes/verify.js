const express = require("express");
const { nanoid } = require("nanoid");
const { requireAuth } = require("../middleware/auth");
const User = require("../models/User");
const ManualCode = require("../models/ManualCode");
const EmailVerifyToken = require("../models/EmailVerifyToken");

const router = express.Router();

// Email verification (simple: generate token; you can email the link yourself)
router.post("/email/start", requireAuth, async (req, res, next) => {
  try {
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h
    await EmailVerifyToken.create({ user: req.user.id, token, expiresAt });

    const frontend = process.env.FRONTEND_ORIGIN || "";
    const base = frontend.endsWith("/") ? frontend.slice(0, -1) : frontend;
    const link = frontend ? `${base}/?email_verify=${token}` : token;

    res.json({ token, link, message: "Email verification started" });
  } catch (e) { next(e); }
});

router.get("/email/confirm", async (req, res, next) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ message: "Missing token" });

    const rec = await EmailVerifyToken.findOne({ token });
    if (!rec) return res.status(400).json({ message: "Invalid token" });
    if (rec.usedAt) return res.status(400).json({ message: "Token already used" });
    if (rec.expiresAt.getTime() < Date.now()) return res.status(400).json({ message: "Token expired" });

    await User.findByIdAndUpdate(rec.user, { emailVerified: true });
    rec.usedAt = new Date();
    await rec.save();

    res.json({ message: "Email verified" });
  } catch (e) { next(e); }
});

// Manual trust verification (WhatsApp + code required)
router.post("/manual/redeem", requireAuth, async (req, res, next) => {
  try {
    const code = String((req.body || {}).code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ message: "Missing code" });

    const rec = await ManualCode.findOne({ code });
    if (!rec) return res.status(400).json({ message: "Invalid code" });
    if (rec.usedAt) return res.status(400).json({ message: "Code already used" });
    if (rec.expiresAt.getTime() < Date.now()) return res.status(400).json({ message: "Code expired" });

    // mark user verified
    await User.findByIdAndUpdate(req.user.id, {
      verified: true,
      verifiedAt: new Date(),
      verifiedNote: "Verified via WhatsApp + code"
    });

    rec.usedAt = new Date();
    rec.usedBy = req.user.id;
    await rec.save();

    const user = await User.findById(req.user.id).lean();
    res.json({ message: "Verified", verified: true, user: { id: user._id, email: user.email, verified: user.verified } });
  } catch (e) { next(e); }
});

module.exports = router;
