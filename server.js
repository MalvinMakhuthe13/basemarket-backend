const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const authMiddleware = require("./middleware/auth");

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

// Ping route for testing
app.post("/ping", (req, res) => {
  res.json({ message: "Ping works" });
});

// Protected profile route
/*app.get("/api/profile", authMiddleware, (req, res) => {
  res.json({
    message: "This is your protected profile route",
    user: req.user
  });
});*/
const User = require("./models/User");

app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


// Root route
app.get("/", (req, res) => {
  res.send("BaseMarket Backend Running 🚀");
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

/*******for products**/
const productRoutes = require("./routes/products");
app.use("/api/products", productRoutes);
