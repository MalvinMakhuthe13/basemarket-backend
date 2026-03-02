const express = require("express");
const { nanoid } = require("nanoid");
const { requireAdminKey } = require("../middleware/adminKey");
const User = require("../models/User");
const ManualCode = require("../models/ManualCode");

const router = express.Router();
router.use(requireAdminKey);

// GET /api/admin/users?search=
router.get("/users", async (req, res, next) => {
  try {
    const q = String(req.query.search || "").trim().toLowerCase();
    const filter = q
      ? { $or: [{ email: { $regex: q, $options: "i" } }, { name: { $regex: q, $options: "i" } }] }
      : {};
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ users });
  } catch (e) { next(e); }
});

// POST /api/admin/verify-user { userId, note }
router.post("/verify-user", async (req, res, next) => {
  try {
    const { userId, note } = req.body || {};
    if (!userId) return res.status(400).json({ message: "Missing userId" });

    await User.findByIdAndUpdate(userId, {
      verified: true,
      verifiedAt: new Date(),
      verifiedNote: String(note || "Verified by admin"),
    });

    res.json({ message: "User verified" });
  } catch (e) { next(e); }
});

router.post("/unverify-user", async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ message: "Missing userId" });

    await User.findByIdAndUpdate(userId, {
      verified: false,
      verifiedAt: null,
      verifiedNote: "",
    });

    res.json({ message: "User unverified" });
  } catch (e) { next(e); }
});

// Seller approvals (optional)
router.get("/sellers/pending", async (req, res, next) => {
  try {
    const users = await User.find({ "seller.status": "pending" }).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ users });
  } catch (e) { next(e); }
});

router.post("/sellers/approve", async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ message: "Missing userId" });

    await User.findByIdAndUpdate(userId, {
      "seller.status": "approved",
      "seller.decidedAt": new Date(),
      "seller.decisionReason": "",
    });

    res.json({ message: "Seller approved" });
  } catch (e) { next(e); }
});

router.post("/sellers/reject", async (req, res, next) => {
  try {
    const { userId, reason } = req.body || {};
    if (!userId) return res.status(400).json({ message: "Missing userId" });
    if (!reason) return res.status(400).json({ message: "Missing reason" });

    await User.findByIdAndUpdate(userId, {
      "seller.status": "rejected",
      "seller.decidedAt": new Date(),
      "seller.decisionReason": String(reason),
    });

    res.json({ message: "Seller rejected" });
  } catch (e) { next(e); }
});

// POST /api/admin/verification-code { daysValid }
router.post("/verification-code", async (req, res, next) => {
  try {
    const daysValid = Number((req.body || {}).daysValid || 30);
    const ms = 1000 * 60 * 60 * 24 * (Number.isFinite(daysValid) && daysValid > 0 ? daysValid : 30);
    const code = nanoid(10).toUpperCase().replace(/[-_]/g, "A");
    const expiresAt = new Date(Date.now() + ms);

    await ManualCode.create({ code, expiresAt });
    res.json({ code, expiresAt });
  } catch (e) { next(e); }
});

module.exports = router;
