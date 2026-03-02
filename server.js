require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { connectDB } = require("./src/config/db");
const { notFound, errorHandler } = require("./src/middleware/error");

const authRoutes = require("./src/routes/auth");
const listingRoutes = require("./src/routes/listings");
const orderRoutes = require("./src/routes/orders");
const messageRoutes = require("./src/routes/messages");
const verifyRoutes = require("./src/routes/verify");
const adminRoutes = require("./src/routes/admin");

const app = express();

app.use(helmet());
app.use(express.json({ limit: "2mb" }));

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || "*";
app.use(cors({
  origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN.split(",").map(s => s.trim()),
  credentials: true,
}));

app.use(morgan("dev"));
app.set("trust proxy", 1);

// Basic rate limiting (safe defaults)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
}));

app.get("/", (req, res) => res.json({ message: "BaseMarket API running" }));

app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 10000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((e) => {
    console.error("Failed to start:", e);
    process.exit(1);
  });
