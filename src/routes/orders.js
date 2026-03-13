const express = require("express");
const { requireAuth } = require("../middleware/auth");
const Order = require("../models/Order");
const Listing = require("../models/Listing");

const router = express.Router();

function addTimeline(order, type, message) {
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  order.timeline.push({ type, message, at: new Date() });
}

function makeReleaseCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.get("/__ping", (req, res) => {
  res.json({ ok: true, route: "orders", at: Date.now() });
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { listingId, qty, mode, contact, address, notes, secureDeal, destinationCity, courier, deliveryMethod } = req.body || {};
    if (!listingId) return res.status(400).json({ message: "Missing listingId" });

    const listing = await Listing.findById(listingId).populate("owner", "_id name email").lean();
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const sellerId = listing.owner?._id || listing.owner;
    if (String(sellerId) === String(req.user.id)) {
      return res.status(400).json({ message: "You cannot buy your own listing" });
    }

    const isSecure = !!secureDeal;
    const resolvedDeliveryMethod = mode === 'ticket' ? 'digital' : (deliveryMethod || ((address || destinationCity) ? 'shipping' : 'meetup'));
    const unitPrice = Number(listing.price || 0);
    const quantity = Math.max(1, Number(qty || 1));
    const shippingFee = isSecure && resolvedDeliveryMethod === 'shipping' ? Number((courier && courier.price) || 0) : 0;
    const amount = Number((unitPrice * quantity) + shippingFee);

    const order = await Order.create({
      listing: listing._id,
      buyer: req.user.id,
      seller: sellerId,
      qty: quantity,
      mode: mode || "item",
      contact: contact || "",
      address: address || "",
      contactReleased: false,
      contactReleasedAt: null,
      notes: notes || "",
      secureDeal: isSecure,
      unitPrice,
      shippingFee,
      amount,
      currency: listing.currency || 'ZAR',
      paymentStatus: isSecure ? 'awaiting_payment' : 'not_applicable',
      escrowStatus: isSecure ? 'holding_pending_payment' : 'open',
      payoutStatus: isSecure ? 'not_ready' : 'n/a',
      deliveryMethod: resolvedDeliveryMethod,
      destinationCity: destinationCity || '',
      courier: courier || null,
      gateway: isSecure ? 'payfast' : '',
      releaseCode: isSecure && resolvedDeliveryMethod === 'meetup' ? makeReleaseCode() : '',
      timeline: [{ type: 'created', message: isSecure ? 'Secure Deal created. Waiting for secure payment confirmation.' : 'Order created.', at: new Date() }],
    });

    const full = await Order.findById(order._id).populate('listing').lean();
    res.json(full);
  } catch (e) {
    next(e);
  }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const items = await Order.find({ buyer: req.user.id }).populate('listing').sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e) { next(e); }
});

router.get('/sold', requireAuth, async (req, res, next) => {
  try {
    const items = await Order.find({ seller: req.user.id }).populate('listing').sort({ createdAt: -1 }).lean();
    const safe = items.map((o) => {
      if (!o.contactReleased) { delete o.contact; delete o.address; }
      return o;
    });
    res.json(safe);
  } catch (e) { next(e); }
});

async function releaseContact(req, res, next) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.buyer) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    order.contactReleased = true;
    order.contactReleasedAt = new Date();
    addTimeline(order, 'privacy', 'Buyer released contact details to seller.');
    await order.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
}

router.post('/release-contact/:id', requireAuth, releaseContact);
router.post('/:id/release-contact', requireAuth, releaseContact);

router.post('/:id/activate-secure-deal', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.secureDeal) return res.status(400).json({ message: 'This order is not a Secure Deal' });
    if (String(order.buyer) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    return res.status(400).json({ message: 'Direct buyer payment confirmation is disabled. Use the secure payment gateway.' });
  } catch (e) { next(e); }
});

router.post('/:id/mark-shipped', requireAuth, async (req, res, next) => {
  try {
    const { trackingNumber = '' } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.secureDeal) return res.status(400).json({ message: 'This order is not a Secure Deal' });
    if (String(order.seller) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    if (order.paymentStatus !== 'paid') return res.status(400).json({ message: 'Secure Deal payment has not been confirmed yet' });
    order.trackingNumber = trackingNumber || order.trackingNumber;
    order.sellerMarkedShippedAt = new Date();
    order.escrowStatus = order.deliveryMethod === 'meetup' ? 'meetup_ready' : 'shipped';
    addTimeline(order, 'fulfilment', order.deliveryMethod === 'meetup' ? 'Seller marked the item ready for meetup.' : `Seller marked the item shipped${trackingNumber ? ` (${trackingNumber})` : ''}.`);
    await order.save();
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});

router.post('/:id/confirm-delivery', requireAuth, async (req, res, next) => {
  try {
    const { releaseCode = '' } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.secureDeal) return res.status(400).json({ message: 'This order is not a Secure Deal' });
    if (String(order.buyer) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    if (order.deliveryMethod === 'meetup' && order.releaseCode && String(releaseCode).trim() !== String(order.releaseCode).trim()) {
      return res.status(400).json({ message: 'Incorrect meetup release code' });
    }
    order.buyerConfirmedAt = new Date();
    order.escrowStatus = 'released';
    order.payoutStatus = 'ready';
    order.releasedAt = new Date();
    addTimeline(order, 'delivery', 'Buyer confirmed delivery. Seller payout is now ready for release.');
    await order.save();
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});

router.post('/:id/open-dispute', requireAuth, async (req, res, next) => {
  try {
    const { reason = '' } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const isBuyer = String(order.buyer) === String(req.user.id);
    const isSeller = String(order.seller) === String(req.user.id);
    if (!isBuyer && !isSeller) return res.status(403).json({ message: 'Not allowed' });
    order.escrowStatus = 'disputed';
    order.disputedAt = new Date();
    order.disputeReason = reason || order.disputeReason;
    addTimeline(order, 'dispute', `Dispute opened${reason ? `: ${reason}` : '.'}`);
    await order.save();
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});


router.post('/:id/mark-paid-out', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    order.payoutStatus = 'paid';
    addTimeline(order, 'payout', 'Seller payout marked as completed by admin.');
    await order.save();
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});

module.exports = router;
