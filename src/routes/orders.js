const express = require("express");
const { requireAuth } = require("../middleware/auth");
const Order = require("../models/Order");
const Listing = require("../models/Listing");

const router = express.Router();

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { listingId, qty, mode, contact, address, notes } = req.body || {};
    if (!listingId) return res.status(400).json({ message: "Missing listingId" });

    const listing = await Listing.findById(listingId).populate("owner", "_id name email").lean();
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const sellerId = listing.owner?._id || listing.owner;
    if (String(sellerId) === String(req.user.id)) return res.status(400).json({ message: "You cannot buy your own listing" });

    const order = await Order.create({
      listing: listing._id,
      buyer: req.user.id,
      seller: sellerId,
      qty: Number(qty || 1),
      mode: mode || "item",
      contact: contact || "",
      address: address || "",
      notes: notes || "",
    });

    const full = await Order.findById(order._id).populate("listing").lean();
    res.json(full);
  } catch (e) { next(e); }
});

router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const items = await Order.find({ buyer: req.user.id }).populate("listing").sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e) { next(e); }
});

router.get("/sold", requireAuth, async (req, res, next) => {
  try {
    const items = await Order.find({ seller: req.user.id }).populate("listing").sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e) { next(e); }
});

module.exports = router;
