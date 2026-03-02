const express = require("express");
const { requireAuth } = require("../middleware/auth");
const Conversation = require("../models/Conversation");
const Listing = require("../models/Listing");
const { pickListingTitle } = require("../utils/common");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const myId = req.user.id;
    const convs = await Conversation.find({
      $or: [{ buyer: myId }, { seller: myId }]
    })
      .populate("listing", "title name")
      .sort({ updatedAt: -1 })
      .lean();

    const out = convs.map(c => ({
      _id: c._id,
      listingId: c.listing?._id || c.listing,
      listingTitle: pickListingTitle(c.listing),
      lastMessage: c.lastMessage || "",
      lastMessageAt: c.lastMessageAt || c.updatedAt,
      updatedAt: c.updatedAt,
    }));

    res.json({ conversations: out });
  } catch (e) { next(e); }
});

router.post("/start", requireAuth, async (req, res, next) => {
  try {
    const { listingId, text } = req.body || {};
    if (!listingId) return res.status(400).json({ message: "Missing listingId" });

    const listing = await Listing.findById(listingId).populate("owner", "_id name").lean();
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const sellerId = listing.owner?._id || listing.owner;
    const buyerId = req.user.id;
    if (String(sellerId) === String(buyerId)) return res.status(400).json({ message: "Cannot message yourself" });

    let conv = await Conversation.findOne({ listing: listingId, buyer: buyerId, seller: sellerId });
    if (!conv) {
      conv = await Conversation.create({ listing: listingId, buyer: buyerId, seller: sellerId });
    }

    if (text && String(text).trim()) {
      conv.messages.push({ sender: buyerId, text: String(text).trim() });
      conv.lastMessage = String(text).trim();
      conv.lastMessageAt = new Date();
      await conv.save();
    }

    res.json({ conversationId: conv._id });
  } catch (e) { next(e); }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const c = await Conversation.findById(req.params.id)
      .populate("messages.sender", "name email")
      .lean();

    if (!c) return res.status(404).json({ message: "Conversation not found" });

    const myId = req.user.id;
    const allowed = String(c.buyer) === String(myId) || String(c.seller) === String(myId);
    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    res.json({ messages: c.messages || [] });
  } catch (e) { next(e); }
});

router.post("/:id", requireAuth, async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ message: "Message empty" });

    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: "Conversation not found" });

    const myId = req.user.id;
    const allowed = String(conv.buyer) === String(myId) || String(conv.seller) === String(myId);
    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    conv.messages.push({ sender: myId, text: String(text).trim() });
    conv.lastMessage = String(text).trim();
    conv.lastMessageAt = new Date();
    await conv.save();

    res.json({ message: "Sent" });
  } catch (e) { next(e); }
});

module.exports = router;
