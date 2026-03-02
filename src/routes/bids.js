const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Listing = require("../models/Listing");
const requirePhoneVerified = require("../middleware/requirePhoneVerified");

// POST /api/bids/:listingId { amount }
// Rules:
// - Only during auction window (if start/end provided)
// - Listing owner cannot bid (prevents "seller bidding against bidders")
router.post("/:listingId", auth, requirePhoneVerified, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid bid amount" });
    }

    const listing = await Listing.findById(req.params.listingId);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const data = listing.data || listing; // works for nested data shape
    const ownerId = String(listing.owner || data.owner || "");
    if (ownerId && ownerId === String(req.user.id)) {
      return res.status(403).json({ message: "Owners cannot bid on their own listings." });
    }

    const start = data.auctionStart ? new Date(data.auctionStart) : null;
    const end = data.auctionEnd ? new Date(data.auctionEnd) : null;
    const now = new Date();

    if (start && end && !isNaN(start) && !isNaN(end)) {
      if (now < start) return res.status(400).json({ message: "Auction not active yet." });
      if (now > end) return res.status(400).json({ message: "Auction has ended." });
    }

    const currentBid = Number(data.currentBid || 0);
    if (currentBid && amount <= currentBid) {
      return res.status(400).json({ message: "Bid must be higher than the current bid." });
    }

    // update in the nested data object to match your create route
    listing.data = listing.data || {};
    listing.data.currentBid = amount;
    listing.data.lastBidder = req.user.id;
    listing.data.bidCount = Number(listing.data.bidCount || 0) + 1;

    await listing.save();

    res.json({ message: "Bid placed", currentBid: amount });
  } catch (e) {
    res.status(500).json({ message: "Failed to place bid" });
  }
});

module.exports = router;
