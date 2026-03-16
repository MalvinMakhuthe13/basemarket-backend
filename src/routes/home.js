const express = require('express');
const { requireAuth } = require('../middleware/auth');
const SavedSearch = require('../models/SavedSearch');
const Listing = require('../models/Listing');
const { tokenise } = require('../utils/savedSearches');
const { getRecentViewedListings } = require('../utils/activity');

const router = express.Router();

router.post('/personalize', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const recentRaw = Array.isArray(body.recentlyViewed) ? body.recentlyViewed : [];
    const recentEvents = recentRaw.length ? [] : await getRecentViewedListings(req.user.id, 12);
    const recent = recentRaw.length ? recentRaw : recentEvents.map((x)=> ({ id: x.entityId, title: x.meta?.title || '', category: x.meta?.category || '', location: x.meta?.location || '' }));
    const savedItems = Array.isArray(body.savedItems) ? body.savedItems : [];
    const searchHistory = Array.isArray(body.searchHistory) ? body.searchHistory : [];
    const savedSearches = await SavedSearch.find({ user: req.user.id, homepageEnabled: true, isActive: true }).sort({ createdAt: -1 }).limit(8).lean();
    const listings = await Listing.find({ status: 'active' }).populate('owner', 'name verified seller').sort({ createdAt: -1 }).limit(180).lean();

    const signals = [
      ...recent.flatMap((x)=> tokenise([x.title, x.category, x.location].join(' '))),
      ...savedItems.flatMap((x)=> tokenise([x.title, x.category, x.location].join(' '))),
      ...searchHistory.flatMap((x)=> tokenise(x)),
      ...savedSearches.flatMap((x)=> tokenise(`${x.name} ${x.query}`)),
    ];
    const weights = signals.reduce((acc, word)=> (acc[word] = (acc[word] || 0) + 1, acc), {});
    const recentIds = new Set(recent.map((x)=> String(x.id || x._id || x)));
    const picks = listings.map((item)=> {
      const words = tokenise([item.name || item.title, item.description || '', item.category || '', item.location || ''].join(' '));
      let score = 0;
      words.forEach((w)=> { score += (weights[w] || 0) * 3; });
      if (item.owner?.verified) score += 8;
      if (item.allowOffers) score += 3;
      if (Array.isArray(item.images) && item.images.length) score += 2;
      if (recentIds.has(String(item._id))) score -= 30;
      return { item, score };
    }).sort((a,b)=> b.score - a.score);

    const hero = picks[0]?.item || listings[0] || null;
    const becauseYouSaved = listings.filter((item)=> savedSearches.some((s)=> tokenise(`${s.query} ${s.name}`).some((w)=> tokenise(`${item.name} ${item.description} ${item.category}`).includes(w)))).slice(0, 8);
    const trending = listings.filter((x)=> x.owner?.verified || x.allowOffers).slice(0, 8);

    res.json({ ok: true, hero, rails: { forYou: picks.filter((x)=> x.score > 0).slice(0, 8).map((x)=> x.item), becauseYouSaved, trending }, savedSearches: savedSearches.map((x)=> ({ id: x._id, name: x.name, query: x.query, freshCount: x.freshMatchCount || 0 })) });
  } catch (e) { next(e); }
});

module.exports = router;
