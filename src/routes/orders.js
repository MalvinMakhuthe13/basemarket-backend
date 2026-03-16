const express = require("express");
const { requireAuth } = require("../middleware/auth");
const Order = require("../models/Order");
const Listing = require("../models/Listing");
const Conversation = require("../models/Conversation");
const FraudFlag = require('../models/FraudFlag');
const { STATUS, assertTransition, deriveLegacyFields, normalizeOrderState } = require('../utils/orderState');
const { createNotification } = require('../utils/notifications');
const { trackActivity } = require('../utils/activity');

const router = express.Router();

function addTimeline(order, type, message) {
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  order.timeline.push({ type, message, at: new Date() });
}

function makeReleaseCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createFraudFlag(entityType, entityId, reason, severity = 'medium', metadata = {}) {
  try {
    await FraudFlag.create({ entityType, entityId: String(entityId), reason, severity, metadata, createdBy: 'system' });
  } catch (_) {}
}

async function appendOrderConversationMessage(order, text) {
  try {
    if (!order || !order.listing || !order.buyer || !order.seller || !text) return;
    let conversation = await Conversation.findOne({ listing: order.listing, buyer: order.buyer, seller: order.seller, order: order._id });
    if (!conversation) {
      conversation = await Conversation.findOne({ listing: order.listing, buyer: order.buyer, seller: order.seller }).sort({ updatedAt: -1 });
    }
    if (!conversation) {
      conversation = await Conversation.create({ listing: order.listing, buyer: order.buyer, seller: order.seller, order: order._id });
    } else if (!conversation.order) {
      conversation.order = order._id;
    }
    conversation.messages.push({ sender: order.seller, text: String(text).trim() });
    conversation.lastMessage = String(text).trim();
    conversation.lastMessageAt = new Date();
    await conversation.save();
  } catch (_) {}
}

async function hydrate(orderId) {
  return Order.findById(orderId).populate('listing buyer seller').lean();
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
    if (listing.status === 'deleted' || listing.status === 'sold' || listing.status === 'paused') return res.status(400).json({ message: 'Listing is not available right now' });

    const sellerId = listing.owner?._id || listing.owner;
    if (String(sellerId) === String(req.user.id)) return res.status(400).json({ message: "You cannot buy your own listing" });

    const isSecure = !!secureDeal;
    let resolvedDeliveryMethod = mode === 'ticket' ? 'digital' : (deliveryMethod || ((address || destinationCity) ? 'shipping' : 'meetup'));
    if (listing.deliveryType === 'meetup') resolvedDeliveryMethod = 'meetup';
    if (listing.deliveryType === 'delivery') resolvedDeliveryMethod = 'shipping';
    if (listing.deliveryType === 'digital') resolvedDeliveryMethod = 'digital';
    if (listing.deliveryType === 'meetup' && deliveryMethod === 'shipping') return res.status(400).json({ message: 'Seller only allows meetup for this listing' });
    if (listing.deliveryType === 'delivery' && deliveryMethod === 'meetup') return res.status(400).json({ message: 'Seller only allows delivery for this listing' });

    const unitPrice = Number(listing.price || 0);
    const quantity = Math.max(1, Number(qty || 1));
    const shippingFee = isSecure && resolvedDeliveryMethod === 'shipping' ? Number((courier && (courier.price || courier.total)) || 0) : 0;
    const amount = Number((unitPrice * quantity) + shippingFee);

    const duplicateWindow = new Date(Date.now() - (15 * 60 * 1000));
    const existing = await Order.findOne({
      listing: listing._id,
      buyer: req.user.id,
      createdAt: { $gte: duplicateWindow },
      status: { $in: [STATUS.CREATED, STATUS.PAID, STATUS.CONFIRMED, STATUS.SHIPPED, STATUS.DELIVERED] }
    }).lean();
    if (existing) {
      await createFraudFlag('order', existing._id, 'Potential duplicate order attempt for same listing within 15 minutes', 'medium', { listingId, buyerId: req.user.id });
      return res.status(409).json({ message: 'You already have a recent active order for this listing' });
    }

    const order = await Order.create({
      listing: listing._id,
      buyer: req.user.id,
      seller: sellerId,
      qty: quantity,
      mode: mode || "item",
      status: STATUS.CREATED,
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

    deriveLegacyFields(order);
    await order.save();
    await trackActivity({ userId: req.user.id, type: 'order_created', entityType: 'order', entityId: String(order._id), listingId: listing._id, meta: { amount, secureDeal: isSecure, deliveryMethod: resolvedDeliveryMethod } }).catch(()=>null);
    await createNotification({ userId: sellerId, type: 'order_created', title: 'New order received', body: `${listing.title || listing.name || 'A listing'} was ordered on BaseMarket.`, actionUrl: '/profile.html', actionLabel: 'View orders', icon: 'shopping-bag', severity: 'success' }).catch(()=>null);
    const existingConversation = await Conversation.findOne({ listing: listing._id, buyer: req.user.id, seller: sellerId }).sort({ updatedAt: -1 }).catch(()=>null);
    if (existingConversation) {
      if (!existingConversation.order) existingConversation.order = order._id;
      existingConversation.lastMessage = existingConversation.lastMessage || 'Order created';
      existingConversation.lastMessageAt = new Date();
      await existingConversation.save().catch(()=>null);
    } else {
      await Conversation.create({ listing: listing._id, buyer: req.user.id, seller: sellerId, order: order._id, lastMessage: 'Order created', lastMessageAt: new Date() }).catch(()=>null);
    }
    await createNotification({ userId: req.user.id, type: 'order_created', title: 'Order created', body: `Your order for ${listing.title || listing.name || 'this listing'} is now open.`, actionUrl: '/profile.html', actionLabel: 'Track order', icon: 'shopping-bag', severity: 'info' }).catch(()=>null);
    res.json(await hydrate(order._id));
  } catch (e) { next(e); }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const docs = await Order.find({ buyer: req.user.id }).populate('listing seller').sort({ createdAt: -1 });
    for (const doc of docs) { normalizeOrderState(doc); await doc.save().catch(()=>null); }
    res.json(docs.map((d) => d.toObject ? d.toObject() : d));
  } catch (e) { next(e); }
});

router.get('/sold', requireAuth, async (req, res, next) => {
  try {
    const docs = await Order.find({ seller: req.user.id }).populate('listing buyer').sort({ createdAt: -1 });
    for (const doc of docs) { normalizeOrderState(doc); await doc.save().catch(()=>null); }
    const safe = docs.map((doc) => { const o = doc.toObject ? doc.toObject() : doc; if (!o.contactReleased) { delete o.contact; delete o.address; } return o; });
    res.json(safe);
  } catch (e) { next(e); }
});

async function releaseContact(req, res, next) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    normalizeOrderState(order);
    if (String(order.buyer) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    order.contactReleased = true;
    order.contactReleasedAt = new Date();
    addTimeline(order, 'privacy', 'Buyer released contact details to seller.');
    await order.save();
    await createNotification({ userId: order.seller, type: 'order_update', title: 'Buyer released contact details', body: 'You can now view the buyer contact details for fulfilment.', actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'unlock', severity: 'info' }).catch(()=>null);
    res.json({ ok: true });
  } catch (e) { next(e); }
}
router.post('/release-contact/:id', requireAuth, releaseContact);
router.post('/:id/release-contact', requireAuth, releaseContact);

router.post('/:id/mark-confirmed', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    normalizeOrderState(order);
    if (String(order.seller) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    if (order.secureDeal && order.paymentStatus !== 'paid') return res.status(400).json({ message: 'Payment must be confirmed first' });
    assertTransition(order.status, STATUS.CONFIRMED);
    order.status = STATUS.CONFIRMED;
    deriveLegacyFields(order);
    addTimeline(order, 'order', 'Seller confirmed the order and is preparing fulfilment.');
    await order.save();
    await appendOrderConversationMessage(order, 'Seller confirmed the order. The order is now moving into fulfilment.');
    await createNotification({ userId: order.buyer, type: 'order_update', title: 'Seller confirmed your order', body: 'Your order is now being prepared for fulfilment.', actionUrl: '/profile.html', actionLabel: 'Track order', icon: 'package-check', severity: 'success' }).catch(()=>null);
    await createNotification({ userId: order.seller, type: 'order_update', title: 'Order moved to fulfilment', body: 'This order is now confirmed and should be prepared for shipping, meetup, or delivery.', actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'package', severity: 'info' }).catch(()=>null);
    res.json({ ok: true, order: await hydrate(order._id) });
  } catch (e) { next(e); }
});


router.post('/:id/mark-preparing', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    normalizeOrderState(order);
    if (String(order.seller) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    if (order.secureDeal && order.paymentStatus !== 'paid') return res.status(400).json({ message: 'Payment must be confirmed first' });
    if (![STATUS.PAID, STATUS.CONFIRMED].includes(order.status)) return res.status(400).json({ message: 'Order is not ready for preparing yet' });
    if (order.status === STATUS.PAID) order.status = STATUS.CONFIRMED;
    order.sellerPreparingAt = order.sellerPreparingAt || new Date();
    deriveLegacyFields(order);
    addTimeline(order, 'fulfilment', order.deliveryMethod === 'meetup' ? 'Seller started preparing the meetup handover.' : 'Seller started preparing the shipment.');
    await order.save();
    const updateText = order.deliveryMethod === 'meetup' ? 'Seller is now preparing your meetup handover.' : 'Seller is now preparing your shipment.';
    await appendOrderConversationMessage(order, updateText);
    await createNotification({ userId: order.buyer, type: 'order_update', title: 'Seller started preparing your order', body: updateText, actionUrl: '/profile.html', actionLabel: 'Track order', icon: 'box', severity: 'info' }).catch(()=>null);
    await createNotification({ userId: order.seller, type: 'order_update', title: 'Preparing stage saved', body: 'The buyer can now see that you are preparing the order.', actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'box', severity: 'success' }).catch(()=>null);
    res.json({ ok: true, order: await hydrate(order._id) });
  } catch (e) { next(e); }
});

router.post('/:id/mark-shipped', requireAuth, async (req, res, next) => {
  try {
    const { trackingNumber = '' } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    normalizeOrderState(order);
    if (String(order.seller) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    if (order.secureDeal && order.paymentStatus !== 'paid') return res.status(400).json({ message: 'Secure Deal payment has not been confirmed yet' });
    if (order.status === STATUS.PAID) {
      order.status = STATUS.CONFIRMED;
      addTimeline(order, 'order', 'Seller confirmed the order.');
    }
    assertTransition(order.status, order.deliveryMethod === 'meetup' ? STATUS.DELIVERED : STATUS.SHIPPED);
    order.trackingNumber = trackingNumber || order.trackingNumber;
    order.sellerMarkedShippedAt = new Date();
    order.status = order.deliveryMethod === 'meetup' ? STATUS.DELIVERED : STATUS.SHIPPED;
    deriveLegacyFields(order);
    addTimeline(order, 'fulfilment', order.deliveryMethod === 'meetup' ? 'Seller marked the item ready for meetup and handover.' : `Seller marked the item shipped${trackingNumber ? ` (${trackingNumber})` : ''}.`);
    await order.save();
    await appendOrderConversationMessage(order, order.deliveryMethod === 'meetup' ? 'Seller marked the order ready for meetup / handover.' : `Seller marked the order shipped${trackingNumber ? ` (${trackingNumber})` : ''}.`);
    await createNotification({ userId: order.buyer, type: 'order_update', title: order.deliveryMethod === 'meetup' ? 'Meetup order ready' : 'Order shipped', body: order.deliveryMethod === 'meetup' ? 'The seller marked your order ready for meetup / handover.' : 'Your seller marked the order as shipped.', actionUrl: '/profile.html', actionLabel: 'Track order', icon: 'truck', severity: 'info' }).catch(()=>null);
    await createNotification({ userId: order.seller, type: 'order_update', title: order.deliveryMethod === 'meetup' ? 'Meetup marked ready' : 'Shipment update saved', body: order.deliveryMethod === 'meetup' ? 'The order now waits for the buyer handover confirmation.' : 'The buyer has been notified that the order shipped.', actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'truck', severity: 'success' }).catch(()=>null);
    res.json({ ok: true, order: await hydrate(order._id) });
  } catch (e) { next(e); }
});

router.post('/:id/confirm-delivery', requireAuth, async (req, res, next) => {
  try {
    const { releaseCode = '' } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.buyer) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    if (order.deliveryMethod === 'meetup' && order.releaseCode && String(releaseCode).trim() !== String(order.releaseCode).trim()) {
      return res.status(400).json({ message: 'Incorrect meetup release code' });
    }
    if (order.status === STATUS.SHIPPED) {
      assertTransition(order.status, STATUS.DELIVERED);
      order.status = STATUS.DELIVERED;
    }
    assertTransition(order.status, STATUS.COMPLETED);
    order.buyerConfirmedAt = new Date();
    order.status = STATUS.COMPLETED;
    order.releasedAt = new Date();
    deriveLegacyFields(order);
    addTimeline(order, 'delivery', 'Buyer confirmed delivery. Seller payout is now ready for release.');
    await order.save();
    await appendOrderConversationMessage(order, 'Buyer confirmed delivery. The order is now complete and the seller payout is ready.');
    await createNotification({ userId: order.seller, type: 'order_update', title: 'Buyer confirmed delivery', body: 'Your order is completed and payout is now ready for release.', actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'badge-check', severity: 'success' }).catch(()=>null);
    await createNotification({ userId: order.buyer, type: 'order_update', title: 'Order completed', body: 'Thanks for confirming delivery. Your order is now complete.', actionUrl: '/profile.html', actionLabel: 'View order', icon: 'check-circle', severity: 'success' }).catch(()=>null);
    res.json({ ok: true, order: await hydrate(order._id) });
  } catch (e) { next(e); }
});

router.post('/:id/open-dispute', requireAuth, async (req, res, next) => {
  try {
    const { reason = '' } = req.body || {};
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    normalizeOrderState(order);
    const isBuyer = String(order.buyer) === String(req.user.id);
    const isSeller = String(order.seller) === String(req.user.id);
    if (!isBuyer && !isSeller && req.user.role !== 'admin') return res.status(403).json({ message: 'Not allowed' });
    if (order.status !== STATUS.DISPUTED) assertTransition(order.status, STATUS.DISPUTED);
    order.status = STATUS.DISPUTED;
    order.disputedAt = new Date();
    order.disputeReason = reason || order.disputeReason;
    deriveLegacyFields(order);
    addTimeline(order, 'dispute', `Dispute opened${reason ? `: ${reason}` : '.'}`);
    await order.save();
    await createNotification({ userId: order.buyer, type: 'order_update', title: 'Dispute opened', body: 'A dispute was opened on this order. Our team can now review it.', actionUrl: '/profile.html', actionLabel: 'View order', icon: 'shield-alert', severity: 'warning' }).catch(()=>null);
    await createNotification({ userId: order.seller, type: 'order_update', title: 'Dispute opened', body: 'A dispute was opened on this order. Please review the issue details.', actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'shield-alert', severity: 'warning' }).catch(()=>null);
    await createFraudFlag('order', order._id, reason || 'Order dispute opened', 'high', { buyer: order.buyer, seller: order.seller });
    res.json({ ok: true, order: await hydrate(order._id) });
  } catch (e) { next(e); }
});

router.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    normalizeOrderState(order);
    const actorAllowed = String(order.buyer) === String(req.user.id) || String(order.seller) === String(req.user.id) || req.user.role === 'admin';
    if (!actorAllowed) return res.status(403).json({ message: 'Not allowed' });
    assertTransition(order.status, STATUS.CANCELLED);
    order.status = STATUS.CANCELLED;
    deriveLegacyFields(order);
    addTimeline(order, 'order', req.user.role === 'admin' ? 'Order cancelled by admin.' : 'Order cancelled.');
    await order.save();
    await createNotification({ userId: order.buyer, type: 'order_update', title: 'Order cancelled', body: 'This order was cancelled.', actionUrl: '/profile.html', actionLabel: 'View order', icon: 'x-circle', severity: 'warning' }).catch(()=>null);
    await createNotification({ userId: order.seller, type: 'order_update', title: 'Order cancelled', body: 'This order was cancelled.', actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'x-circle', severity: 'warning' }).catch(()=>null);
    res.json({ ok: true, order: await hydrate(order._id) });
  } catch (e) { next(e); }
});

router.post('/:id/mark-paid-out', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    normalizeOrderState(order);
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    order.payoutStatus = 'paid';
    addTimeline(order, 'payout', 'Seller payout marked as completed by admin.');
    await order.save();
    await appendOrderConversationMessage(order, 'Admin marked the seller payout as paid.');
    await createNotification({ userId: order.seller, type: 'payout_update', title: 'Seller payout marked paid', body: 'Admin marked the seller payout as completed.', actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'wallet', severity: 'success' }).catch(()=>null);
    res.json({ ok: true, order: await hydrate(order._id) });
  } catch (e) { next(e); }
});



router.post('/:id/mark-delivered', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    normalizeOrderState(order);
    if (String(order.seller) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    if (order.secureDeal && order.paymentStatus !== 'paid') return res.status(400).json({ message: 'Secure Deal payment has not been confirmed yet' });
    if (order.status === STATUS.PAID) order.status = STATUS.CONFIRMED;
    if (![STATUS.CONFIRMED, STATUS.SHIPPED].includes(order.status)) return res.status(400).json({ message: 'Order is not ready to be marked delivered' });
    assertTransition(order.status, STATUS.DELIVERED);
    order.status = STATUS.DELIVERED;
    order.sellerMarkedShippedAt = order.sellerMarkedShippedAt || new Date();
    deriveLegacyFields(order);
    addTimeline(order, 'fulfilment', order.deliveryMethod === 'meetup' ? 'Seller marked the meetup handover complete.' : 'Seller marked the shipment delivered / handed over.');
    await order.save();
    await appendOrderConversationMessage(order, order.deliveryMethod === 'meetup' ? 'Seller marked the meetup handover complete.' : 'Seller marked the order delivered / handed over.');
    await createNotification({ userId: order.buyer, type: 'order_update', title: 'Seller marked the order delivered', body: 'Please confirm delivery if everything is correct.', actionUrl: '/profile.html', actionLabel: 'Track order', icon: 'package-check', severity: 'info' }).catch(()=>null);
    await createNotification({ userId: order.seller, type: 'order_update', title: 'Delivery stage recorded', body: 'The order has moved to delivered and now waits for buyer confirmation.', actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'package-check', severity: 'success' }).catch(()=>null);
    res.json({ ok: true, order: await hydrate(order._id) });
  } catch (e) { next(e); }
});



router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const myId = String(req.user.id);
    const allowed = String(order.buyer) === myId || String(order.seller) === myId || req.user.role === 'admin';
    if (!allowed) return res.status(403).json({ message: 'Not allowed' });

    const status = String(order.status || '').toLowerCase();
    const payment = String(order.paymentStatus || '').toLowerCase();
    const deletable = ['created','cancelled','completed','refunded'].includes(status) || (order.secureDeal && status === 'created' && payment !== 'paid');
    if (!deletable && req.user.role !== 'admin') {
      return res.status(400).json({ message: 'Only unpaid or finished orders can be deleted' });
    }

    await Conversation.deleteMany({ order: order._id }).catch(()=>null);
    await order.deleteOne();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
