const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

// ===== IMPORT ROUTES & MIDDLEWARE =====
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const authMiddleware = require("./middleware/auth");
const User = require("./models/User");

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// ===== MONGODB =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.error(err));

// ===== ROUTES =====
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);

// ===== PING ROUTE =====
app.post("/ping", (req, res) => {
  res.json({ message: "Ping works" });
});

// ===== PROTECTED PROFILE ROUTE =====
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// ===== ROOT ROUTE =====
app.get("/", (req, res) => {
  res.send("BaseMarket Backend Running 🚀");
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
