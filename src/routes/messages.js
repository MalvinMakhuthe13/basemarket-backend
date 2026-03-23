const express = require("express");
const { requireAuth } = require("../middleware/auth");
const Conversation = require("../models/Conversation");
const Listing = require("../models/Listing");
const Order = require('../models/Order');
const { pickListingTitle } = require("../utils/common");
const { normalizeListingMode, getListingTypeMeta, enrichListingModeFields } = require("../utils/listingModes");
const { createNotification } = require("../utils/notifications");
const { trackActivity } = require("../utils/activity");
const { buildTrustProfilesForUsers } = require("../utils/trust");
const FraudFlag = require('../models/FraudFlag');

const router = express.Router();


function detectRiskSignals(text = '') {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  const triggers = [
    { key: 'outside_payment', re: /(pay\s+(outside|off)\s+(the\s+)?platform|outside\s+the\s+app|off-platform|pay\s+me\s+direct)/i, label: 'Outside-platform payment request' },
    { key: 'whatsapp_redirect', re: /(whatsapp\s+me|move\s+to\s+whatsapp|chat\s+on\s+whatsapp)/i, label: 'Conversation moved to WhatsApp' },
    { key: 'bank_transfer', re: /(bank\s+transfer|eft|cash\s+deposit|send\s+to\s+my\s+account)/i, label: 'Direct bank-transfer request' },
    { key: 'external_contact', re: /(email\s+me\s+at|text\s+me\s+on|call\s+me\s+on)/i, label: 'External contact request' },
  ];
  const matches = triggers.filter((t) => t.re.test(lower)).map((t) => t.label);
  return { risky: matches.length > 0, flags: matches };
}

async function createFraudSignalsForMessage({ text, actorId, conversationId, listingId }) {
  const scan = detectRiskSignals(text);
  if (!scan.risky) return scan;
  await FraudFlag.create({
    entityType: 'user',
    entityId: String(actorId || ''),
    severity: scan.flags.length > 1 ? 'high' : 'medium',
    reason: scan.flags.join('; '),
    status: 'open',
    createdBy: 'system',
    metadata: { conversationId: String(conversationId || ''), listingId: String(listingId || ''), text: String(text || '').slice(0, 240) }
  }).catch(() => null);
  return scan;
}


function getReadField(conversation, userId) {
  if (!conversation || !userId) return null;
  if (String(conversation.buyer) === String(userId)) return 'buyerLastReadAt';
  if (String(conversation.seller) === String(userId)) return 'sellerLastReadAt';
  return null;
}

function getUnreadCount(conversation, userId) {
  const readField = getReadField(conversation, userId);
  if (!readField) return 0;
  const readAt = conversation[readField] ? new Date(conversation[readField]).getTime() : 0;
  const mine = String(userId);
  return Array.isArray(conversation.messages)
    ? conversation.messages.filter((m) => {
        const senderId = String((m && m.sender && (m.sender._id || m.sender.id)) || m.sender || '');
        const createdAt = m && m.createdAt ? new Date(m.createdAt).getTime() : 0;
        return senderId && senderId !== mine && createdAt > readAt;
      }).length
    : 0;
}

function getCounterparty(conversation, userId) {
  const mine = String(userId || '');
  const raw = String(conversation?.buyer?._id || conversation?.buyer?.id || conversation?.buyer || '') === mine
    ? (conversation.seller || null)
    : (conversation.buyer || null);
  if (!raw) return null;
  return {
    id: raw._id || raw.id || raw,
    name: raw.name || '',
    email: raw.email || ''
  };
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const myId = req.user.id;
    const convs = await Conversation.find({ $or: [{ buyer: myId }, { seller: myId }] })
      .populate("listing", "title name images category deliveryType allowTrade allowOffers location price owner")
      .populate('buyer', 'name email')
      .populate('seller', 'name email')
      .populate('order', 'status amount deliveryMethod paymentStatus payoutStatus escrowStatus trackingNumber sellerPreparingAt')
      .sort({ updatedAt: -1 })
      .lean();

    const trustProfiles = await buildTrustProfilesForUsers(convs.flatMap((c) => [c.buyer, c.seller]).filter(Boolean));
    const out = convs.map(c => ({
      _id: c._id,
      buyer: c.buyer?._id || c.buyer || null,
      seller: c.seller?._id || c.seller || null,
      listingId: c.listing?._id || c.listing,
      listingTitle: pickListingTitle(c.listing),
      listingImage: Array.isArray(c.listing?.images) && c.listing.images[0] ? c.listing.images[0] : '',
      listingMode: normalizeListingMode(c.listing?.listingMode || c.listing?.category || 'sell'),
      listingModeMeta: getListingTypeMeta(c.listing?.listingMode || c.listing?.category || 'sell'),
      listingDeliveryType: c.listing?.deliveryType || null,
      listingAllowTrade: !!c.listing?.allowTrade,
      listingAllowOffers: !!c.listing?.allowOffers,
      orderId: c.order?._id || c.order || null,
      orderStatus: c.order?.status || null,
      orderDeliveryMethod: c.order?.deliveryMethod || null,
      lastMessage: c.lastMessage || "",
      lastMessageAt: c.lastMessageAt || c.updatedAt,
      updatedAt: c.updatedAt,
      unreadCount: getUnreadCount(c, myId),
      counterpart: getCounterparty(c, myId),
      counterpartTrustProfile: trustProfiles[String((getCounterparty(c, myId) || {}).id || '')] || null,
    })).sort((a, b) => {
      if ((b.unreadCount || 0) !== (a.unreadCount || 0)) return (b.unreadCount || 0) - (a.unreadCount || 0);
      return new Date(b.lastMessageAt || b.updatedAt || 0) - new Date(a.lastMessageAt || a.updatedAt || 0);
    });

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

    let conv = null;
    if (normalizedOrderId) {
      conv = await Conversation.findOne({ listing: listingId, buyer: buyerId, seller: sellerId, order: normalizedOrderId });
    }
    if (!conv) {
      conv = await Conversation.findOne({ listing: listingId, buyer: buyerId, seller: sellerId }).sort({ updatedAt: -1 });
    }
    if (!conv) {
      conv = await Conversation.create({ listing: listingId, buyer: buyerId, seller: sellerId, order: normalizedOrderId, buyerLastReadAt: new Date() });
    } else if (normalizedOrderId && !conv.order) {
      conv.order = normalizedOrderId;
    }

    conv.buyerLastReadAt = new Date();

    if (text && String(text).trim()) {
      conv.messages.push({ sender: buyerId, text: String(text).trim() });
      conv.lastMessage = String(text).trim();
      conv.lastMessageAt = new Date();
      await conv.save();
      const riskScan = await createFraudSignalsForMessage({ text, actorId: buyerId, conversationId: conv._id, listingId });
      await trackActivity({ userId: buyerId, type: 'message_sent', entityType: 'conversation', entityId: String(conv._id), meta: { listingId: String(listingId), risky: !!riskScan.risky } }).catch(()=>null);
      await createNotification({ userId: sellerId, type: 'message_received', title: `New message on ${pickListingTitle(listing)}`, body: String(text).trim().slice(0, 140), actionUrl: '/profile.html', actionLabel: 'Open inbox', icon: 'message-circle', severity: riskScan.risky ? 'warn' : 'info', dedupeKey: '' }).catch(()=>null);
    }

    res.json({ conversationId: conv._id });
  } catch (e) { next(e); }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const c = await Conversation.findById(req.params.id)
            .populate("messages.sender", "name email")
      .populate('buyer', 'name email')
      .populate('seller', 'name email')
      .populate('order', 'status amount deliveryMethod paymentStatus payoutStatus escrowStatus trackingNumber sellerPreparingAt contactReleased contact address releaseCode')
      .populate('listing', 'title name images location price category deliveryType allowTrade allowOffers owner')
      .exec();
    if (!c) return res.status(404).json({ message: "Conversation not found" });

    const myId = req.user.id;
    const allowed = String(c.buyer?._id || c.buyer) === String(myId) || String(c.seller?._id || c.seller) === String(myId);
    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    const readField = getReadField(c, myId);
    if (readField) {
      c[readField] = new Date();
      await c.save().catch(() => null);
    }

    const payload = c.toObject ? c.toObject() : c;
    const trustProfiles = await buildTrustProfilesForUsers([payload.buyer, payload.seller, payload.listing && payload.listing.owner].filter(Boolean));
    const listingOwnerId = String(payload.listing?.owner?._id || payload.listing?.owner?.id || payload.listing?.owner || '');
    const counterpart = getCounterparty(payload, myId);
    const counterpartTrustProfile = trustProfiles[String(counterpart?.id || '')] || null;
    const listingPayload = enrichListingModeFields(payload.listing || null);
    if (listingOwnerId && trustProfiles[listingOwnerId]) listingPayload.trustProfile = trustProfiles[listingOwnerId];
    const fraudWarnings = [];
    for (const msg of (payload.messages || [])) {
      const scan = detectRiskSignals(msg && msg.text);
      if (scan.risky) {
        fraudWarnings.push({
          messageId: msg && (msg._id || msg.id) ? String(msg._id || msg.id) : '',
          flags: scan.flags,
          createdAt: msg && msg.createdAt ? msg.createdAt : null,
        });
      }
    }
    res.json({
      messages: payload.messages || [],
      order: payload.order || null,
      listing: listingPayload,
      counterpart,
      counterpartTrustProfile,
      unreadCount: getUnreadCount(payload, myId),
      fraudWarnings,
    });
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
    const readField = getReadField(conv, myId);
    if (readField) conv[readField] = new Date();
    await conv.save();
    const recipientId = String(conv.buyer) === String(myId) ? conv.seller : conv.buyer;
    const riskScan = await createFraudSignalsForMessage({ text, actorId: myId, conversationId: conv._id, listingId: conv.listing });
    await trackActivity({ userId: myId, type: 'message_sent', entityType: 'conversation', entityId: String(conv._id), meta: { listingId: String(conv.listing || ''), risky: !!riskScan.risky } }).catch(()=>null);
    await createNotification({ userId: recipientId, type: 'message_received', title: 'New inbox message', body: String(text).trim().slice(0, 140), actionUrl: '/profile.html', actionLabel: 'Open inbox', icon: 'message-circle', severity: riskScan.risky ? 'warn' : 'info' }).catch(()=>null);

    res.json({ message: "Sent" });
  } catch (e) { next(e); }
});



router.delete('/:id/message/:messageId', requireAuth, async (req, res, next) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    const myId = String(req.user.id);
    const allowed = String(conv.buyer) == myId || String(conv.seller) == myId || req.user.role === 'admin';
    if (!allowed) return res.status(403).json({ message: 'Not allowed' });
    const idx = (conv.messages || []).findIndex((m) => String(m._id) === String(req.params.messageId));
    if (idx === -1) return res.status(404).json({ message: 'Message not found' });
    const msg = conv.messages[idx];
    const canDelete = req.user.role === 'admin' || String(msg.sender) === myId;
    if (!canDelete) return res.status(403).json({ message: 'You can only delete your own messages' });
    conv.messages.splice(idx, 1);
    const last = conv.messages[conv.messages.length - 1];
    conv.lastMessage = last ? String(last.text || '').trim() : '';
    conv.lastMessageAt = last ? (last.createdAt || new Date()) : null;
    await conv.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    const myId = String(req.user.id);
    const allowed = String(conv.buyer) == myId || String(conv.seller) == myId || req.user.role === 'admin';
    if (!allowed) return res.status(403).json({ message: 'Not allowed' });
    await conv.deleteOne();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
