const express = require("express");
const Listing = require("../models/Listing");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function asDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

router.get("/", async (req, res, next) => {
  try {
    // Keep auctions visible after they end (so the UI can show "Ended")
    // Only hide deleted items.
    const items = await Listing.find({
      $or: [
        { status: { $ne: "deleted" } },
        { status: { $exists: false } }, // older docs with no status field
      ],
    })
      .populate("owner", "name email verified seller phone")
      .sort({ createdAt: -1 })
      .lean();

    // Defensive: ensure bidsCount is present even for older auction docs
    const normalized = (items || []).map((it) => {
      if (it && typeof it === "object") {
        if (it.bidsCount == null && Array.isArray(it.bids)) it.bidsCount = it.bids.length;
        // mark ended status automatically for auctions (non-destructive)
        if (String(it.category || "").toLowerCase() === "auction" && it.auctionEnd) {
          const end = new Date(it.auctionEnd);
          if (Number.isFinite(end.getTime()) && Date.now() > end.getTime()) {
            it.status = it.status === "deleted" ? "deleted" : (it.status || "active");
          }
        }
      }
      return it;
    });

    res.json(normalized);
  } catch (e) {
    next(e);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const category = String(b.category || "sell").toLowerCase().trim();

    const auctionStart = asDate(b.auctionStart);
    const auctionEnd = asDate(b.auctionEnd);

    const price = Number(b.price || 0);
    const startingBid = Number(b.startingBid || price || 0);
    const currentBid = Number(b.currentBid || startingBid || 0);

    const doc = await Listing.create({
      owner: req.user.id,
      title: b.title || b.name || "",
      name: b.name || b.title || "",
      description: b.description || "",
      price: price,
      currency: b.currency || "ZAR",
      category,
      images: Array.isArray(b.images) ? b.images : b.image ? [b.image] : [],
      location: b.location || "",

      // auction fields (ignored by non-auctions)
      auctionStart: category === "auction" ? auctionStart : null,
      auctionEnd: category === "auction" ? auctionEnd : null,
      startingBid: category === "auction" ? startingBid : 0,
      currentBid: category === "auction" ? currentBid : 0,
      bids: [],
      bidsCount: 0,

      status: "active",
    });

    const populated = await Listing.findById(doc._id)
      .populate("owner", "name email verified seller phone")
      .lean();

    res.json(populated);
  } catch (e) {
    next(e);
  }
});

// PATCH listing (owner only) - supports the frontend fallback / last resort updates
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await Listing.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Listing not found" });
    if (String(item.owner) !== String(req.user.id)) return res.status(403).json({ message: "Not allowed" });

    const b = req.body || {};

    // allow safe updates
    if (b.title != null) item.title = String(b.title);
    if (b.name != null) item.name = String(b.name);
    if (b.description != null) item.description = String(b.description);
    if (b.price != null) item.price = Number(b.price || 0);
    if (b.location != null) item.location = String(b.location);
    if (Array.isArray(b.images)) item.images = b.images;

    // auction updates (only if listing is auction)
    const isAuction = String(item.category || "").toLowerCase() === "auction";
    if (isAuction) {
      if (b.auctionStart !== undefined) item.auctionStart = asDate(b.auctionStart);
      if (b.auctionEnd !== undefined) item.auctionEnd = asDate(b.auctionEnd);
      if (b.startingBid !== undefined) item.startingBid = Number(b.startingBid || 0);
      if (b.currentBid !== undefined) item.currentBid = Number(b.currentBid || 0);
    }

    await item.save();
    const populated = await Listing.findById(item._id).populate("owner", "name email verified seller phone").lean();
    res.json(populated);
  } catch (e) {
    next(e);
  }
});

// Place a bid
router.post("/:id/bid", requireAuth, async (req, res, next) => {
  try {
    const listingId = req.params.id;
    const amount = Number(req.body?.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Bid amount must be a positive number." });
    }

    const item = await Listing.findById(listingId);
    if (!item) return res.status(404).json({ message: "Listing not found" });

    if (String(item.category || "").toLowerCase() !== "auction") {
      return res.status(400).json({ message: "This listing is not an auction." });
    }

    const now = new Date();

    if (item.auctionStart && now < item.auctionStart) {
      return res.status(400).json({ message: "Bid window closed (auction not started yet)." });
    }
    if (item.auctionEnd && now > item.auctionEnd) {
      // keep visible but mark ended
      item.status = "ended";
      await item.save();
      return res.status(400).json({ message: "Bid window closed (auction ended)." });
    }

    const current = Number(item.currentBid || item.startingBid || item.price || 0);
    if (amount <= current) {
      return res.status(400).json({ message: `Bid must be higher than current bid (${current}).` });
    }

    item.currentBid = amount;
    item.bids.push({ bidder: req.user.id, amount, createdAt: now });
    item.bidsCount = item.bids.length;
    await item.save();

    res.json({
      listingId: String(item._id),
      currentBid: item.currentBid,
      bidsCount: item.bidsCount,
      auctionEnd: item.auctionEnd,
      auctionStart: item.auctionStart,
      status: item.status,
    });
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await Listing.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Listing not found" });
    if (String(item.owner) !== String(req.user.id)) return res.status(403).json({ message: "Not allowed" });

    item.status = "deleted";
    await item.save();
    res.json({ message: "Deleted" });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
