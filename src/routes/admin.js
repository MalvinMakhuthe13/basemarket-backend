const express = require("express");
const { requireAdminKey } = require("../middleware/adminKey");
const User = require("../models/User");
const ManualCode = require("../models/ManualCode");
const Listing = require('../models/Listing');
const Order = require('../models/Order');
const FraudFlag = require('../models/FraudFlag');
const Conversation = require('../models/Conversation');
const Dispute = require('../models/Dispute');
const { STATUS, deriveLegacyFields, assertTransition } = require('../utils/orderState');

const router = express.Router();
router.use(requireAdminKey);


function generateVerificationCode(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}


function addTimeline(order, type, message) {
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  order.timeline.push({ type, message, at: new Date() });
}

async function hydrateOrder(id) {
  return Order.findById(id).populate('listing buyer seller').lean();
}

router.get('/analytics', async (_req, res, next) => {
  try {
    const [
      paidOrders, verifiedUsers, verifiedSellers, conversations, fraudOpen, pendingSellers, listingPaused, disputedOrders, refundedOrders, gmvAgg, orderMixAgg, openDisputes
    ] = await Promise.all([
      Order.countDocuments({ paymentStatus: 'paid' }),
      User.countDocuments({ $or: [{ verified: true }, { emailVerified: true }, { 'phone.verified': true }] }),
      User.countDocuments({ 'seller.status': 'approved' }),
      Conversation.countDocuments({}),
      FraudFlag.countDocuments({ status: 'open' }),
      User.countDocuments({ 'seller.status': 'pending' }),
      Listing.countDocuments({ status: 'paused' }),
      Order.countDocuments({ status: 'disputed' }),
      Order.countDocuments({ status: 'refunded' }),
      Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } }]),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Dispute.countDocuments({ status: { $in: ['open','under_review'] } }),
    ]);
    const orderMix = {};
    for (const row of orderMixAgg || []) { if (row && row._id) orderMix[row._id] = row.count; }
    const gmv = Number((gmvAgg && gmvAgg[0] && gmvAgg[0].total) || 0);
    res.json({ paidOrders, verifiedUsers, verifiedSellers, conversations, fraudOpen, pendingSellers, listingPaused, disputedOrders, refundedOrders, openDisputes, gmv, orderMix });
  } catch (e) { next(e); }
});


router.get('/fraud-flags', async (req, res, next) => {
  try {
    const status = String(req.query.status || 'open').trim().toLowerCase();
    const filter = status === 'all' ? {} : { status };
    const flags = await FraudFlag.find(filter).sort({ createdAt: -1 }).limit(300).lean();
    res.json({ flags });
  } catch (e) { next(e); }
});

router.post('/fraud-flags/:id/resolve', async (req, res, next) => {
  try {
    const status = String(req.body?.status || 'resolved').trim().toLowerCase();
    if (!['reviewed','resolved','dismissed'].includes(status)) return res.status(400).json({ message: 'Invalid fraud status' });
    const flag = await FraudFlag.findByIdAndUpdate(req.params.id, { status, resolvedAt: new Date() }, { new: true }).lean();
    if (!flag) return res.status(404).json({ message: 'Fraud flag not found' });
    res.json({ ok: true, flag });
  } catch (e) { next(e); }
});

router.get('/overview', async (_req, res, next) => {
  try {
    const [users, listings, orders, fraudOpen] = await Promise.all([
      User.countDocuments({}),
      Listing.countDocuments({ status: { $ne: 'deleted' } }),
      Order.countDocuments({}),
      FraudFlag.countDocuments({ status: 'open' }),
    ]);
    res.json({ users, listings, orders, fraudOpen });
  } catch (e) { next(e); }
});

router.get("/users", async (req, res, next) => {
  try {
    const q = String(req.query.search || "").trim().slice(0, 100); // cap length
    // Escape special regex characters to prevent ReDoS
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = escaped ? { $or: [{ email: { $regex: escaped, $options: "i" } }, { name: { $regex: escaped, $options: "i" } }] } : {};
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ users });
  } catch (e) { next(e); }
});

router.post('/users/:id/ban', async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { role: 'user', 'seller.status': 'rejected', 'seller.decisionReason': 'Account restricted by admin' }, { new: true }).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    await FraudFlag.create({ entityType: 'user', entityId: String(user._id), reason: 'User restricted by admin', severity: 'high', createdBy: 'admin' });
    res.json({ ok: true, user });
  } catch (e) { next(e); }
});

router.post("/verify-user", async (req, res, next) => {
  try {
    const { userId, note } = req.body || {};
    if (!userId) return res.status(400).json({ message: "Missing userId" });
    await User.findByIdAndUpdate(userId, { verified: true, verifiedAt: new Date(), verifiedNote: String(note || "Verified by admin") });
    res.json({ message: "User verified" });
  } catch (e) { next(e); }
});

router.post("/unverify-user", async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ message: "Missing userId" });
    await User.findByIdAndUpdate(userId, { verified: false, verifiedAt: null, verifiedNote: "" });
    res.json({ message: "User unverified" });
  } catch (e) { next(e); }
});

router.get("/sellers/pending", async (_req, res, next) => {
  try {
    const users = await User.find({ "seller.status": "pending" }).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ users });
  } catch (e) { next(e); }
});

router.post("/sellers/approve", async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ message: "Missing userId" });
    await User.findByIdAndUpdate(userId, { "seller.status": "approved", "seller.decidedAt": new Date(), "seller.decisionReason": "" });
    res.json({ message: "Seller approved" });
  } catch (e) { next(e); }
});

router.post("/sellers/reject", async (req, res, next) => {
  try {
    const { userId, reason } = req.body || {};
    if (!userId) return res.status(400).json({ message: "Missing userId" });
    if (!reason) return res.status(400).json({ message: "Missing reason" });
    await User.findByIdAndUpdate(userId, { "seller.status": "rejected", "seller.decidedAt": new Date(), "seller.decisionReason": String(reason) });
    res.json({ message: "Seller rejected" });
  } catch (e) { next(e); }
});

router.post("/verification-code", async (req, res, next) => {
  try {
    const daysValid = Number((req.body || {}).daysValid || 30);
    const ms = 1000 * 60 * 60 * 24 * (Number.isFinite(daysValid) && daysValid > 0 ? daysValid : 30);
    const code = generateVerificationCode(10);
    const expiresAt = new Date(Date.now() + ms);
    await ManualCode.create({ code, expiresAt });
    res.json({ code, expiresAt });
  } catch (e) { next(e); }
});


router.get('/listings', async (req, res, next) => {
  try {
    const q = String(req.query.search || '').trim();
    const status = String(req.query.status || 'all').trim().toLowerCase();
    const sourceType = String(req.query.sourceType || 'all').trim().toLowerCase();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = {};
    if (status !== 'all') filter.moderationStatus = status;
    if (sourceType !== 'all') filter.sourceType = sourceType;
    if (escaped) filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { name: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
    ];
    const listings = await Listing.find(filter).populate('owner', 'name email').sort({ isSponsored: -1, sponsoredPriority: -1, createdAt: -1 }).limit(400).lean();
    res.json({ listings });
  } catch (e) { next(e); }
});

router.post('/listings/:id/moderate', async (req, res, next) => {
  try {
    const { action, reason } = req.body || {};
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    const normalized = String(action || '').toLowerCase();
    if (!['approve','reject','pause','restore','delete'].includes(normalized)) return res.status(400).json({ message: 'Invalid action' });
    if (normalized === 'approve') {
      listing.moderationStatus = 'approved';
      if (listing.status === 'paused') listing.status = 'active';
    }
    if (normalized === 'reject') {
      listing.moderationStatus = 'rejected';
      listing.status = 'paused';
    }
    if (normalized === 'pause') listing.status = 'paused';
    if (normalized === 'restore') {
      listing.status = 'active';
      if (listing.moderationStatus === 'rejected') listing.moderationStatus = 'approved';
    }
    if (normalized === 'delete') listing.status = 'deleted';
    listing.moderationReason = String(reason || '');
    listing.moderatedAt = new Date();
    listing.moderatedBy = 'admin';
    await listing.save();
    res.json({ ok: true, listing });
  } catch (e) { next(e); }
});

router.post('/sponsored-listings', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!String(b.title || '').trim()) return res.status(400).json({ message: 'Title is required' });
    const item = await Listing.create({
      owner: null,
      sourceType: 'sponsored',
      isSponsored: true,
      moderationStatus: 'approved',
      moderatedAt: new Date(),
      moderatedBy: 'admin',
      title: String(b.title || '').trim(),
      name: String(b.title || '').trim(),
      description: String(b.description || '').trim(),
      price: Number(b.price || 0),
      currency: String(b.currency || 'ZAR').trim() || 'ZAR',
      category: String(b.category || 'sell').trim() || 'sell',
      images: Array.isArray(b.images) ? b.images : (b.image ? [b.image] : []),
      location: String(b.location || '').trim(),
      deliveryType: 'both',
      allowOffers: false,
      allowTrade: false,
      allowBundles: false,
      status: String(b.status || 'active') === 'paused' ? 'paused' : 'active',
      sponsoredLabel: String(b.sponsoredLabel || 'Sponsored').trim() || 'Sponsored',
      sponsoredUrl: String(b.sponsoredUrl || '').trim(),
      sponsoredCta: String(b.sponsoredCta || 'Shop now').trim() || 'Shop now',
      sponsoredPriority: Number(b.sponsoredPriority || 0),
      sponsoredStartsAt: b.sponsoredStartsAt ? new Date(b.sponsoredStartsAt) : null,
      sponsoredEndsAt: b.sponsoredEndsAt ? new Date(b.sponsoredEndsAt) : null,
      accentColor: String(b.accentColor || '').trim(),
    });
    const listing = await Listing.findById(item._id).lean();
    res.json({ ok: true, listing });
  } catch (e) { next(e); }
});


router.get('/disputes', async (req, res, next) => {
  try {
    const status = String(req.query.status || 'all').trim().toLowerCase();
    const filter = status === 'all' ? {} : { status };
    const disputes = await Dispute.find(filter).populate('order listing buyer seller openedBy').sort({ createdAt: -1 }).limit(300).lean();
    res.json({ disputes });
  } catch (e) { next(e); }
});

router.post('/disputes/:id/resolve', async (req, res, next) => {
  try {
    const { outcome = 'other', note = '', status = 'resolved' } = req.body || {};
    if (!['resolved','dismissed'].includes(String(status))) return res.status(400).json({ message: 'Invalid dispute status' });
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ message: 'Dispute not found' });
    dispute.status = String(status);
    dispute.resolution = { outcome: String(outcome || 'other'), note: String(note || ''), resolvedAt: new Date(), resolvedBy: 'admin' };
    await dispute.save();

    const order = await Order.findById(dispute.order);
    if (order) {
      if (String(status) === 'dismissed') {
        order.status = STATUS.COMPLETED;
        order.payoutStatus = 'ready';
      } else if (String(outcome) === 'refund_buyer' || String(outcome) === 'partial_refund') {
        order.status = STATUS.REFUNDED;
        order.paymentStatus = 'refunded';
        order.payoutStatus = 'not_ready';
      } else {
        order.status = STATUS.COMPLETED;
        order.payoutStatus = 'ready';
      }
      deriveLegacyFields(order);
      order.timeline.push({ type: 'admin', message: `Dispute ${status} by admin. Outcome: ${outcome}.`, at: new Date() });
      await order.save();
    }

    res.json({ ok: true, dispute, order });
  } catch (e) { next(e); }
});

router.get('/orders', async (_req, res, next) => {
  try {
    const orders = await Order.find({}).populate('listing buyer seller').sort({ createdAt: -1 }).limit(300).lean();
    res.json({ orders });
  } catch (e) { next(e); }
});

router.post('/orders/:id/cancel', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.status = STATUS.CANCELLED;
    deriveLegacyFields(order);
    order.timeline.push({ type: 'admin', message: 'Order cancelled by admin.', at: new Date() });
    await order.save();
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});

router.post('/orders/:id/refund', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.status = STATUS.REFUNDED;
    deriveLegacyFields(order);
    order.timeline.push({ type: 'admin', message: 'Order refunded by admin.', at: new Date() });
    await order.save();
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});

router.get('/fraud-flags', async (_req, res, next) => {
  try {
    const flags = await FraudFlag.find({}).sort({ createdAt: -1 }).limit(300).lean();
    res.json({ flags });
  } catch (e) { next(e); }
});



router.patch('/listings/:id/status', async (req, res, next) => {
  try {
    const status = String((req.body || {}).status || '').trim();
    if (!['active','paused','sold','deleted','ended'].includes(status)) {
      return res.status(400).json({ message: 'Invalid listing status' });
    }
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    listing.status = status;
    await listing.save();
    res.json({ ok: true, listing });
  } catch (e) { next(e); }
});

router.post('/orders/:id/confirm', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.secureDeal && order.paymentStatus !== 'paid') return res.status(400).json({ message: 'Payment must be confirmed first' });
    assertTransition(order.status, STATUS.CONFIRMED);
    order.status = STATUS.CONFIRMED;
    deriveLegacyFields(order);
    addTimeline(order, 'admin', 'Admin marked the order confirmed.');
    await order.save();
    res.json({ ok: true, order: await hydrateOrder(order._id) });
  } catch (e) { next(e); }
});

router.post('/orders/:id/ship', async (req, res, next) => {
  try {
    const { trackingNumber = '' } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.secureDeal && order.paymentStatus !== 'paid') return res.status(400).json({ message: 'Payment must be confirmed first' });
    if (order.status === STATUS.PAID) {
      order.status = STATUS.CONFIRMED;
      addTimeline(order, 'admin', 'Admin confirmed the order before fulfilment.');
    }
    const nextStatus = order.deliveryMethod === 'meetup' ? STATUS.DELIVERED : STATUS.SHIPPED;
    assertTransition(order.status, nextStatus);
    order.status = nextStatus;
    order.trackingNumber = trackingNumber || order.trackingNumber;
    order.sellerMarkedShippedAt = new Date();
    deriveLegacyFields(order);
    addTimeline(order, 'admin', nextStatus === STATUS.DELIVERED ? 'Admin marked the order ready / handed over for meetup.' : `Admin marked the order shipped${trackingNumber ? ` (${trackingNumber})` : ''}.`);
    await order.save();
    res.json({ ok: true, order: await hydrateOrder(order._id) });
  } catch (e) { next(e); }
});

router.post('/orders/:id/deliver', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if ([STATUS.CONFIRMED, STATUS.SHIPPED].includes(order.status)) {
      assertTransition(order.status, STATUS.DELIVERED);
      order.status = STATUS.DELIVERED;
      order.buyerConfirmedAt = order.buyerConfirmedAt || new Date();
      deriveLegacyFields(order);
      addTimeline(order, 'admin', 'Admin marked the order delivered.');
      await order.save();
      return res.json({ ok: true, order: await hydrateOrder(order._id) });
    }
    return res.status(400).json({ message: 'Order is not ready to be marked delivered' });
  } catch (e) { next(e); }
});

router.post('/orders/:id/complete', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status === STATUS.SHIPPED) {
      assertTransition(order.status, STATUS.DELIVERED);
      order.status = STATUS.DELIVERED;
    }
    assertTransition(order.status, STATUS.COMPLETED);
    order.status = STATUS.COMPLETED;
    order.releasedAt = new Date();
    deriveLegacyFields(order);
    addTimeline(order, 'admin', 'Admin completed the order.');
    await order.save();
    res.json({ ok: true, order: await hydrateOrder(order._id) });
  } catch (e) { next(e); }
});

router.post('/orders/:id/payout', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.payoutStatus = 'paid';
    addTimeline(order, 'admin', 'Admin marked seller payout as paid.');
    await order.save();
    res.json({ ok: true, order: await hydrateOrder(order._id) });
  } catch (e) { next(e); }
});

module.exports = router;
