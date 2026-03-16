require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require('path');

const { connectDB } = require("./src/config/db");
const { notFound, errorHandler } = require("./src/middleware/error");

const authRoutes = require("./src/routes/auth");
const listingRoutes = require("./src/routes/listings");
const orderRoutes = require("./src/routes/orders");
const messageRoutes = require("./src/routes/messages");
const verifyRoutes = require("./src/routes/verify");
const adminRoutes = require("./src/routes/admin");
const aiRoutes = require("./src/routes/ai");
const payfastRoutes = require("./src/routes/payfast");
const recommendationsRoutes = require("./src/routes/recommendations");
const savedSearchesRoutes = require("./src/routes/savedSearches");
const notificationsRoutes = require("./src/routes/notifications");
const homeRoutes = require("./src/routes/home");
const activityRoutes = require("./src/routes/activity");
const { startAlertJobs } = require("./src/utils/alertJobs");

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN.split(",").map(s => s.trim()), credentials: true }));
app.use(morgan("dev"));
app.set("trust proxy", 1);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: "draft-7", legacyHeaders: false }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get("/", (_req, res) => res.json({ message: "BaseMarket API running", version: 'v3-payfast-seamless' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/payfast", payfastRoutes);
app.use("/api/recommendations", recommendationsRoutes);
app.use("/api/saved-searches", savedSearchesRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/home", homeRoutes);
app.use("/api/activity", activityRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 10000;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startAlertJobs();
  });
}).catch((e) => {
  console.error("Failed to start:", e);
  process.exit(1);
});
