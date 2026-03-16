const ActivityEvent = require('../models/ActivityEvent');

async function trackActivity({ userId, type, entityType='listing', entityId='', listingId=null, meta={} }) {
  if (!userId || !type) return null;
  return ActivityEvent.create({ user: userId, type, entityType, entityId: String(entityId || listingId || ''), listing: listingId || null, meta });
}

async function getRecentViewedListings(userId, limit=18) {
  const events = await ActivityEvent.find({ user: userId, type: { $in: ['view_listing', 'quick_view', 'checkout_view'] } })
    .sort({ createdAt: -1 }).limit(limit * 3).lean();
  const seen = new Set();
  const out = [];
  for (const ev of events) {
    const key = String(ev.entityId || ev.listing || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = { trackActivity, getRecentViewedListings };
