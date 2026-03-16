const express = require("express");
const { requireAuth } = require("../middleware/auth");
const Conversation = require("../models/Conversation");
const Listing = require("../models/Listing");
const Order = require('../models/Order');
const { pickListingTitle } = require("../utils/common");
const { createNotification } = require("../utils/notifications");
const { trackActivity } = require("../utils/activity");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const myId = req.user.id;
    const convs = await Conversation.find({ $or: [{ buyer: myId }, { seller: myId }] })
      .populate("listing", "title name")
.populate('order', 'status amount deliveryMethod paymentStatus payoutStatus escrowStatus trackingNumber sellerPreparingAt')
      .sort({ updatedAt: -1 })
      .lean();

    const out = convs.map(c => ({
      _id: c._id,
      buyer: c.buyer || null,
      seller: c.seller || null,
      listingId: c.listing?._id || c.listing,
      listingTitle: pickListingTitle(c.listing),
      orderId: c.order?._id || c.order || null,
      orderStatus: c.order?.status || null,
      lastMessage: c.lastMessage || "",
      lastMessageAt: c.lastMessageAt || c.updatedAt,
      updatedAt: c.updatedAt,
    }));

    res.json({ conversations: out });
  } catch (e) { next(e); }
});

router.post("/start", requireAuth, async (req, res, next) => {
  try {
    const { listingId, text, orderId } = req.body || {};
    if (!listingId) return res.status(400).json({ message: "Missing listingId" });

    const listing = await Listing.findById(listingId).populate("owner", "_id name").lean();
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const sellerId = listing.owner?._id || listing.owner;
    const buyerId = req.user.id;
    if (String(sellerId) === String(buyerId)) return res.status(400).json({ message: "Cannot message yourself" });

    let normalizedOrderId = null;
    if (orderId) {
      const order = await Order.findById(orderId).lean();
      if (!order) return res.status(404).json({ message: 'Order not found' });
      const allowed = String(order.buyer) === String(buyerId) || String(order.seller) === String(buyerId);
      if (!allowed) return res.status(403).json({ message: 'Not allowed for this order' });
      normalizedOrderId = order._id;
    }

    let conv = await Conversation.findOne({ listing: listingId, buyer: buyerId, seller: sellerId, order: normalizedOrderId });
    if (!conv) conv = await Conversation.create({ listing: listingId, buyer: buyerId, seller: sellerId, order: normalizedOrderId });

    if (text && String(text).trim()) {
      conv.messages.push({ sender: buyerId, text: String(text).trim() });
      conv.lastMessage = String(text).trim();
      conv.lastMessageAt = new Date();
      await conv.save();
      await trackActivity({ userId: buyerId, type: 'message_sent', entityType: 'conversation', entityId: String(conv._id), meta: { listingId: String(listingId) } }).catch(()=>null);
      await createNotification({ userId: sellerId, type: 'message_received', title: `New message on ${pickListingTitle(listing)}`, body: String(text).trim().slice(0, 140), actionUrl: '/profile.html', actionLabel: 'Open inbox', icon: 'message-circle', severity: 'info', dedupeKey: '' }).catch(()=>null);
    }

    res.json({ conversationId: conv._id });
  } catch (e) { next(e); }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const c = await Conversation.findById(req.params.id)
      .populate("messages.sender", "name email")
.populate('order', 'status amount deliveryMethod paymentStatus payoutStatus escrowStatus trackingNumber sellerPreparingAt')
      .lean();
    if (!c) return res.status(404).json({ message: "Conversation not found" });

    const myId = req.user.id;
    const allowed = String(c.buyer) === String(myId) || String(c.seller) === String(myId);
    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    res.json({ messages: c.messages || [], order: c.order || null });
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
    const recipientId = String(conv.buyer) === String(myId) ? conv.seller : conv.buyer;
    await trackActivity({ userId: myId, type: 'message_sent', entityType: 'conversation', entityId: String(conv._id), meta: { listingId: String(conv.listing || '') } }).catch(()=>null);
    await createNotification({ userId: recipientId, type: 'message_received', title: 'New inbox message', body: String(text).trim().slice(0, 140), actionUrl: '/profile.html', actionLabel: 'Open inbox', icon: 'message-circle', severity: 'info' }).catch(()=>null);

    res.json({ message: "Sent" });
  } catch (e) { next(e); }
});

module.exports = router;
