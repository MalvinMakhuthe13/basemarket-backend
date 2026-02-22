import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes.js";
import listingRoutes from "./routes/listings.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import { notFound, errorHandler } from "./middleware/error.js";

const app = express();

// Security
app.use(helmet());

// Body limits (base64 images can be large; Cloudinary still needs the request body)
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Logging
app.use(morgan("dev"));

// CORS (LOCK THIS to your Netlify domain in production)
const allowedOrigin = process.env.CLIENT_ORIGIN || "*";
app.use(
  cors({
    origin: allowedOrigin === "*" ? "*" : [allowedOrigin],
    credentials: true,
  })
);

// Rate limiting
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
  })
);

// Routes
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/uploads", uploadRoutes);

// Errors
app.use(notFound);
app.use(errorHandler);

export default app;
