const express = require("express");
const Listing = require("../models/Listing");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const items = await Listing.find({ status: "active" }).populate("owner", "name email verified seller phone").sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e) { next(e); }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const doc = await Listing.create({
      owner: req.user.id,
      title: b.title || b.name || "",
      name: b.name || b.title || "",
      description: b.description || "",
      price: Number(b.price || 0),
      currency: b.currency || "ZAR",
      category: b.category || "sell",
      images: Array.isArray(b.images) ? b.images : (b.image ? [b.image] : []),
      location: b.location || "",
    });
    const populated = await Listing.findById(doc._id).populate("owner", "name email verified seller phone").lean();
    res.json(populated);
  } catch (e) { next(e); }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await Listing.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Listing not found" });
    if (String(item.owner) !== String(req.user.id)) return res.status(403).json({ message: "Not allowed" });

    item.status = "deleted";
    await item.save();
    res.json({ message: "Deleted" });
  } catch (e) { next(e); }
});

module.exports = router;
