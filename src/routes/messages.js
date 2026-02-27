const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Listing = require("../models/Listing");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

// Helper
function getUserId(req){
  return req.user?.id || req.user?._id;
}

// POST /api/messages/start { listingId }
// Creates or returns a conversation for (listing + buyer).
router.post("/start", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { listingId } = req.body || {};
    if (!listingId) return res.status(400).json({ message: "listingId is required" });

    const listing = await Listing.findById(listingId);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const sellerId = listing.owner?.toString ? listing.owner.toString() : String(listing.owner);

    if (String(sellerId) === String(userId)) {
      return res.status(400).json({ message: "You cannot message your own listing." });
    }

    let conv = await Conversation.findOne({ listing: listingId, buyer: userId });
    if (!conv) {
      conv = await Conversation.create({
        listing: listingId,
        seller: sellerId,
        buyer: userId,
      });
    }

    res.json(conv);
  } catch (err) {
    // handle duplicate index race
    if (err && err.code === 11000) {
      const { listingId } = req.body || {};
      const userId = getUserId(req);
      const conv = await Conversation.findOne({ listing: listingId, buyer: userId });
      return res.json(conv);
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/messages
// Lists conversations for current user (as seller or buyer)
router.get("/", auth, async (req, res) => {
  try {
    const userId = getUserId(req);

    const convs = await Conversation.find({
      $or: [{ seller: userId }, { buyer: userId }],
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate("listing")
      .populate("seller", "name email")
      .populate("buyer", "name email");

    const out = convs.map((c) => {
      const isSeller = String(c.seller?._id || c.seller) === String(userId);
      const other = isSeller ? c.buyer : c.seller;

      // listing title could be stored various ways (flat or nested)
      const l = c.listing || {};
      const listingTitle =
        l.name ||
        l.title ||
        (l.data && (l.data.name || l.data.title)) ||
        "Listing";

      return {
        _id: c._id,
        listingId: l._id,
        listingTitle,
        otherUserId: other?._id,
        otherUserName: other?.name || other?.email || "User",
        lastMessage: c.lastMessage || "",
        lastMessageAt: c.lastMessageAt,
        updatedAt: c.updatedAt,
      };
    });

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/messages/:conversationId
// Returns messages (only if user is part of conversation)
router.get("/:conversationId", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { conversationId } = req.params;

    const conv = await Conversation.findById(conversationId);
    if (!conv) return res.status(404).json({ message: "Conversation not found" });

    const allowed =
      String(conv.seller) === String(userId) || String(conv.buyer) === String(userId);

    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    const msgs = await Message.find({ conversation: conversationId }).sort({ createdAt: 1 });

    // Return minimal fields
    res.json(msgs.map(m => ({
      _id: m._id,
      conversation: m.conversation,
      sender: m.sender,
      text: m.text,
      createdAt: m.createdAt,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/messages/:conversationId { text }
// Sends a message
router.post("/:conversationId", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { conversationId } = req.params;
    const { text } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ message: "Message text is required" });
    }

    const conv = await Conversation.findById(conversationId);
    if (!conv) return res.status(404).json({ message: "Conversation not found" });

    const allowed =
      String(conv.seller) === String(userId) || String(conv.buyer) === String(userId);

    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    const msg = await Message.create({
      conversation: conversationId,
      sender: userId,
      text: String(text).trim(),
    });

    // Update conversation summary
    conv.lastMessage = msg.text.slice(0, 300);
    conv.lastMessageAt = msg.createdAt;
    await conv.save();

    res.json({
      ok: true,
      message: {
        _id: msg._id,
        sender: msg.sender,
        text: msg.text,
        createdAt: msg.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
