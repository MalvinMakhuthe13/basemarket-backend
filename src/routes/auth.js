const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Strict rate limiter for login — max 10 attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  skipSuccessfulRequests: true, // only count failed attempts
});

// Rate limiter for register — max 5 new accounts per hour per IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many accounts created from this IP. Please try again later." },
});

function mustHaveJwtSecret() {
  if (!process.env.JWT_SECRET) {
    const err = new Error("Server misconfigured: JWT_SECRET is missing");
    err.statusCode = 500;
    throw err;
  }
}

function sign(user) {
  mustHaveJwtSecret();
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

router.post("/register", registerLimiter, async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: "Missing fields" });

    const normalizedEmail = String(email).toLowerCase().trim();

    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(400).json({ message: "Email already registered" });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash
    });

    return res.json({
      message: "Registered",
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (e) { next(e); }
});

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Missing fields" });

    const normalizedEmail = String(email).toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    // Back-compat: some older DBs may have stored the hash under `password`
    const hash = user.passwordHash || user.password;
    if (!hash) {
      return res.status(409).json({
        message: "Account needs a password reset (missing password hash). Please re-register with a new email or ask admin to reset your password."
      });
    }

    const ok = await bcrypt.compare(String(password), String(hash));
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    // If the account logged in via legacy `password`, persist into `passwordHash`
    if (!user.passwordHash && user.password) {
      user.passwordHash = String(user.password);
      user.password = undefined;
      await user.save().catch(() => {});
    }

    const token = sign(user);

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        verified: user.verified,
        seller: user.seller,
        phone: user.phone,
        role: user.role,
      }
    });
  } catch (e) { next(e); }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (e) { next(e); }
});

module.exports = router;
