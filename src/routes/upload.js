import express from "express";
import { initCloudinary } from "../config/cloudinary.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
const cloudinary = initCloudinary();

/**
 * Accepts: { base64: "data:image/jpeg;base64,...." }
 * Returns: { url, publicId }
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { base64 } = req.body;
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ message: "Missing base64" });
    }
    if (!base64.startsWith("data:image/")) {
      return res.status(400).json({ message: "Invalid image data" });
    }

    const upload = await cloudinary.uploader.upload(base64, {
      folder: "basemarket/listings",
      resource_type: "image",
    });

    res.json({ url: upload.secure_url, publicId: upload.public_id });
  } catch (err) {
    next(err);
  }
});

export default router;
