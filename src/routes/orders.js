const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Order = require("../models/Order");
const Listing = require("../models/Listing");
const mongoose = require("mongoose");
const requirePhoneVerified = require("../middleware/requirePhoneVerified");


// POST /api/orders { listingId, qty, mode, contact, address, notes }
router.post("/", auth, requirePhoneVerified, async (req, res) => {
  try {
    const { listingId, qty = 1, mode = "item", contact, address = "", notes = "" } = req.body;
    if (!listingId) return res.status(400).json({ message: "listingId is required" });
    if (!contact) return res.status(400).json({ message: "contact is required" });
    

  
if (!mongoose.Types.ObjectId.isValid(listingId)) {
  return res.status(400).json({ message: "Invalid listingId" });
}
 
    
    const listing = await Listing.findById(listingId);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const sellerId = listing.owner;
    if (String(sellerId) === String(req.user.id)) {
      return res.status(403).json({ message: "You cannot buy your own listing." });
    }

    const order = await Order.create({
      listing: listing._id,
      seller: sellerId,
      buyer: req.user.id,
      mode,
      qty: Math.max(1, Number(qty) || 1),
      contact,
      address,
      notes,
    });

    res.json({ message: "Order placed ✅", order });
  } catch (e) {
    res.status(500).json({ message: "Failed to place order" });
  }
});

// GET /api/orders/mine (buyer)
router.get("/mine", auth, async (req, res) => {
  const orders = await Order.find({ buyer: req.user.id })
    .sort({ createdAt: -1 })
    .populate("listing", "data");
  res.json(orders);
});

// GET /api/orders/sold (seller)
router.get("/sold", auth, async (req, res) => {
  const orders = await Order.find({ seller: req.user.id })
    .sort({ createdAt: -1 })
    .populate("listing", "data");
  res.json(orders);
});

module.exports = router;
