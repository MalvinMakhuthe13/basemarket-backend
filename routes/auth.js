console.log("Auth route file loaded");

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth"); // import auth middleware

const router = express.Router();

// ===== REGISTER =====
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully ✅" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== LOGIN =====
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    if (!process.env.JWT_SECRET)
      return res.status(500).json({ message: "JWT_SECRET not defined" });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful ✅",
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });

  } catch (error) {
    console.error(error); // logs the real error
    res.status(500).json({ error: error.message });
  }
});

// ===== ADMIN DELETE USER (optional) =====
router.delete("/admin/delete-user/:id",
  authMiddleware,
  async (req, res) => {
    try {
      // only allow admins (if you have a role field)
      if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });

      await User.findByIdAndDelete(req.params.id);
      res.json({ message: "User deleted by admin" });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

module.exports = router;
