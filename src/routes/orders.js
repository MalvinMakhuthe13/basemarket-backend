const express = require("express");
const { requireAuth } = require("../middleware/auth");
const Order = require("../models/Order");
const Listing = require("../models/Listing");

const router = express.Router();

router.get("/__ping", (req, res) => {
  res.json({ ok: true, route: "orders", at: Date.now() });
});
/**
 * Create order (buyer submits contact/address but it's locked by default)
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { listingId, qty, mode, contact, address, notes } = req.body || {};
    if (!listingId) return res.status(400).json({ message: "Missing listingId" });

    const listing = await Listing.findById(listingId)
      .populate("owner", "_id name email")
      .lean();
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const sellerId = listing.owner?._id || listing.owner;
    if (String(sellerId) === String(req.user.id)) {
      return res.status(400).json({ message: "You cannot buy your own listing" });
    }

    const order = await Order.create({
      listing: listing._id,
      buyer: req.user.id,
      seller: sellerId,

      qty: Number(qty || 1),
      mode: mode || "item",

      // stored, but NOT visible to seller unless released
      contact: contact || "",
      address: address || "",

      // privacy gate (defaults false in schema, but explicit is fine)
      contactReleased: false,
      contactReleasedAt: null,

      notes: notes || "",
    });

    const full = await Order.findById(order._id).populate("listing").lean();
    res.json(full);
  } catch (e) {
    next(e);
  }
});

/**
 * Buyer: see my orders (buyer can see their own contact/address)
 */
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const items = await Order.find({ buyer: req.user.id })
      .populate("listing")
      .sort({ createdAt: -1 })
      .lean();
    res.json(items);
  } catch (e) {
    next(e);
  }
});

/**
 * Seller: see orders sold (contact/address hidden until buyer releases)
 */
router.get("/sold", requireAuth, async (req, res, next) => {
  try {
    const items = await Order.find({ seller: req.user.id })
      .populate("listing")
      .sort({ createdAt: -1 })
      .lean();

    const safe = items.map((o) => {
      if (!o.contactReleased) {
        // ensure seller never receives buyer contact/address
        delete o.contact;
        delete o.address;
      }
      return o;
    });

    res.json(safe);
  } catch (e) {
    next(e);
  }
});

/**
 * Buyer: release contact/address to seller for this order
 * POST /api/orders/:id/release-contact
 */
router.post("/:id/release-contact", requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // buyer only
    if (String(order.buyer) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    order.contactReleased = true;
    order.contactReleasedAt = new Date();
    await order.save();

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;