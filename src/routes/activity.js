const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ActivityEvent = require('../models/ActivityEvent');
const Listing = require('../models/Listing');
const { trackActivity, getRecentViewedListings } = require('../utils/activity');

const router = express.Router();

function sanitizeType(raw='') {
  const type = String(raw || '').trim().toLowerCase();
  const allowed = new Set(['view_listing','quick_view','checkout_view','save_listing','search','message_sent','order_created']);
  return allowed.has(type) ? type : 'view_listing';
}

router.post('/track', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const type = sanitizeType(body.type);
    const listingId = body.listingId || body.entityId || null;
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    const event = await trackActivity({ userId: req.user.id, type, entityType: listingId ? 'listing' : (body.entityType || 'system'), entityId: listingId || body.entityId || '', listingId, meta });
    res.status(201).json({ ok: true, id: event?._id || null });
  } catch (e) { next(e); }
});

router.post('/sync-local-recent', requireAuth, async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    let imported = 0;
    for (const raw of items.slice(0, 50)) {
      const listingId = raw.id || raw.listingId || raw.entityId;
      if (!listingId) continue;
      await trackActivity({
        userId: req.user.id,
        type: sanitizeType(raw.source === 'quick_view' ? 'quick_view' : raw.source === 'checkout' ? 'checkout_view' : 'view_listing'),
        entityType: 'listing',
        entityId: listingId,
        listingId,
        meta: {
          title: raw.title || '',
          category: raw.category || '',
          location: raw.location || '',
          price: raw.price || 0,
          image: raw.image || '',
          viewedAt: raw.viewedAt || new Date().toISOString(),
          importedFrom: 'local_recent',
        }
      });
      imported += 1;
    }
    res.json({ ok: true, imported });
  } catch (e) { next(e); }
});

router.get('/recently-viewed', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(30, Math.max(1, Number(req.query.limit || 18)));
    const events = await getRecentViewedListings(req.user.id, limit);
    const ids = events.map((x) => String(x.entityId || x.listing || '')).filter(Boolean);
    const listings = await Listing.find({ _id: { $in: ids } }).populate('owner', 'name verified seller').lean();
    const byId = new Map(listings.map((x) => [String(x._id), x]));
    const items = events.map((ev) => {
      const listing = byId.get(String(ev.entityId || ev.listing || ''));
      if (!listing) return null;
      return { ...listing, activityType: ev.type, viewedAt: ev.createdAt, activityMeta: ev.meta || {} };
    }).filter(Boolean);
    res.json({ ok: true, items });
  } catch (e) { next(e); }
});

router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const [views, saves, searches] = await Promise.all([
      ActivityEvent.countDocuments({ user: req.user.id, type: { $in: ['view_listing','quick_view','checkout_view'] } }),
      ActivityEvent.countDocuments({ user: req.user.id, type: 'save_listing' }),
      ActivityEvent.countDocuments({ user: req.user.id, type: 'search' }),
    ]);
    res.json({ ok: true, views, saves, searches });
  } catch (e) { next(e); }
});

module.exports = router;
