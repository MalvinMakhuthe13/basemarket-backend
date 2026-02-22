import express from "express";
import Listing from "../models/Listing.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Public feed
router.get("/", async (req, res, next) => {
  try {
    const listings = await Listing.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json(listings);
  } catch (err) {
    next(err);
  }
});

// My listings
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const listings = await Listing.find({ owner: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(listings);
  } catch (err) {
    next(err);
  }
});

// Create listing
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const {
      type,
      title,
      description,
      price,
      negotiable,
      imageUrl,
      imagePublicId,
      category,
      location,
      contact,
      meta,
    } = req.body;

    if (!type || !title) return res.status(400).json({ message: "Missing type/title" });

    const listing = await Listing.create({
      owner: req.user.id,
      type,
      title,
      description: description || "",
      price: price || "",
      negotiable: !!negotiable,
      imageUrl: imageUrl || "",
      imagePublicId: imagePublicId || "",
      category: category || "",
      location: location || "",
      contact: contact || "",
      meta: meta || {},
    });

    res.status(201).json(listing);
  } catch (err) {
    next(err);
  }
});

// Delete listing (owner only)
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: "Not found" });

    if (listing.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await listing.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;