const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Order = require('../models/Order');
const Dispute = require('../models/Dispute');
const { STATUS, deriveLegacyFields } = require('../utils/orderState');
const { createNotification } = require('../utils/notifications');
const { isObjectId, cleanText } = require('../utils/validators');

const router = express.Router();

function addTimeline(order, type, message) {
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  order.timeline.push({ type, message, at: new Date() });
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const disputes = await Dispute.find({ $or: [{ buyer: req.user.id }, { seller: req.user.id }] })
      .populate('order listing buyer seller openedBy')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ disputes });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { orderId, reason, note = '', evidence = [] } = req.body || {};
    if (!isObjectId(orderId)) return res.status(400).json({ message: 'Invalid orderId' });
    const cleanReason = cleanText(reason, 160);
    const cleanNote = cleanText(note, 800);
    if (!cleanReason) return res.status(400).json({ message: 'Reason is required' });

    const order = await Order.findById(orderId).populate('listing buyer seller');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const isParty = [String(order.buyer?._id || order.buyer), String(order.seller?._id || order.seller)].includes(String(req.user.id));
    if (!isParty) return res.status(403).json({ message: 'Not allowed' });

    const existing = await Dispute.findOne({ order: order._id, status: { $in: ['open', 'under_review'] } }).lean();
    if (existing) return res.status(409).json({ message: 'An active dispute already exists for this order', dispute: existing });

    const actorType = String(order.buyer?._id || order.buyer) === String(req.user.id) ? 'buyer' : 'seller';
    const dispute = await Dispute.create({
      order: order._id,
      listing: order.listing?._id || order.listing,
      buyer: order.buyer?._id || order.buyer,
      seller: order.seller?._id || order.seller,
      openedBy: req.user.id,
      reason: cleanReason,
      evidence: Array.isArray(evidence) ? evidence.slice(0, 10) : [],
      messages: cleanNote ? [{ actor: req.user.id, actorType, text: cleanNote }] : [],
    });

    order.status = STATUS.DISPUTED;
    order.disputedAt = new Date();
    order.disputeReason = cleanReason;
    order.escrowStatus = 'disputed';
    order.payoutStatus = 'not_ready';
    addTimeline(order, 'dispute', `Dispute opened: ${String(reason).trim()}`);
    deriveLegacyFields(order);
    await order.save();

    const sellerId = String(order.seller?._id || order.seller);
    const buyerId = String(order.buyer?._id || order.buyer);
    const notifyOther = sellerId === String(req.user.id) ? buyerId : sellerId;
    await createNotification({
      userId: notifyOther,
      type: 'dispute_opened',
      title: 'A dispute was opened',
      body: `A dispute was opened for order ${order._id}. Payout is frozen until review is complete.`,
      actionUrl: '/profile.html',
      actionLabel: 'Open dispute',
      icon: 'shield-alert',
      severity: 'warning',
    }).catch(()=>null);

    res.status(201).json({ ok: true, dispute });
  } catch (e) { next(e); }
});

router.post('/:id/message', requireAuth, async (req, res, next) => {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ message: 'Dispute not found' });
    const isParty = [String(dispute.buyer), String(dispute.seller)].includes(String(req.user.id));
    if (!isParty) return res.status(403).json({ message: 'Not allowed' });
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Message text is required' });
    const actorType = String(dispute.buyer) === String(req.user.id) ? 'buyer' : 'seller';
    dispute.messages.push({ actor: req.user.id, actorType, text });
    if (dispute.status === 'open') dispute.status = 'under_review';
    await dispute.save();
    res.json({ ok: true, dispute });
  } catch (e) { next(e); }
});

module.exports = router;
