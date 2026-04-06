const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Offer = require('../models/Offer');
const Listing = require('../models/Listing');
const { createNotification } = require('../utils/notifications');
const { toMoney, cleanText, isFutureDate } = require('../utils/validators');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const offers = await Offer.find({ $or: [{ buyer: req.user.id }, { seller: req.user.id }] })
      .populate('listing buyer seller')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ offers });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { listingId, amount, message = '', expiresAt = null } = req.body || {};
    const listing = await Listing.findById(listingId).populate('owner', '_id');
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (String(listing.owner?._id || listing.owner) === String(req.user.id)) return res.status(400).json({ message: 'You cannot make an offer on your own listing' });
    const offerAmount = toMoney(amount, -1);
    if (!(offerAmount >= 0)) return res.status(400).json({ message: 'Invalid amount' });
    if (!listing.allowOffers) return res.status(400).json({ message: 'Offers are not enabled for this listing' });
    if (expiresAt && !isFutureDate(expiresAt)) return res.status(400).json({ message: 'Offer expiry must be in the future' });
    const cleanMessage = cleanText(message, 400);
    const offer = await Offer.create({
      listing: listing._id,
      buyer: req.user.id,
      seller: listing.owner?._id || listing.owner,
      amount: offerAmount,
      message: cleanMessage,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    await createNotification({
      userId: listing.owner?._id || listing.owner,
      type: 'offer_received',
      title: 'New offer received',
      body: `${listing.title || listing.name || 'A listing'} received an offer of R${offerAmount.toLocaleString()}.`,
      actionUrl: '/profile.html',
      actionLabel: 'Review offer',
      icon: 'tag',
      severity: 'info',
    }).catch(()=>null);
    res.status(201).json({ ok: true, offer });
  } catch (e) { next(e); }
});

router.post('/:id/respond', requireAuth, async (req, res, next) => {
  try {
    const { action, counterAmount = null } = req.body || {};
    const offer = await Offer.findById(req.params.id).populate('listing');
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    if (String(offer.seller) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    if (offer.status !== 'pending') return res.status(400).json({ message: 'Offer is no longer pending' });
    const normalized = String(action || '').trim().toLowerCase();
    if (!['accept', 'reject', 'counter'].includes(normalized)) return res.status(400).json({ message: 'Invalid action' });
    if (normalized === 'accept') {
      offer.status = 'accepted';
      offer.acceptedAt = new Date();
    }
    if (normalized === 'reject') {
      offer.status = 'rejected';
      offer.rejectedAt = new Date();
    }
    if (normalized === 'counter') {
      const nextAmount = toMoney(counterAmount, -1);
      if (!(nextAmount >= 0)) return res.status(400).json({ message: 'Invalid counter amount' });
      offer.status = 'countered';
      offer.counterAmount = nextAmount;
    }
    await offer.save();
    await createNotification({
      userId: offer.buyer,
      type: 'offer_update',
      title: 'Your offer was updated',
      body: normalized === 'accept' ? 'The seller accepted your offer.' : normalized === 'reject' ? 'The seller rejected your offer.' : `The seller sent a counter offer of R${Number(offer.counterAmount || 0).toLocaleString()}.`,
      actionUrl: '/profile.html',
      actionLabel: 'Open offers',
      icon: 'tag',
      severity: normalized === 'reject' ? 'warning' : 'success',
    }).catch(()=>null);
    res.json({ ok: true, offer });
  } catch (e) { next(e); }
});

module.exports = router;
