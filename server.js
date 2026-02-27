require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");


const authRoutes = require("./src/routes/auth");
const listingRoutes = require("./src/routes/listings");

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
  process.env.FRONTEND_ORIGIN?.replace("https://", "https://www."),
].filter(Boolean);

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: false
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Basemarket API running 🚀" });
});

// ✅ add this
app.get("/health", (req, res) => res.json({ ok: true }));

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT || 5000, () =>
      console.log("Server running on port", process.env.PORT || 5000)
    );
  })
  .catch(err => console.log(err));