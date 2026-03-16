const express = require('express');
const Listing = require('../models/Listing');
const { requireAuth } = require('../middleware/auth');
const { getRecentViewedListings } = require('../utils/activity');

const router = express.Router();

function tokenise(text=''){
  return [...new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter((x)=>x && x.length>1))];
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const recentRaw = Array.isArray(body.recentlyViewed) ? body.recentlyViewed : [];
    const recentEvents = recentRaw.length ? [] : await getRecentViewedListings(req.user.id, 12);
    const recent = recentRaw.length ? recentRaw : recentEvents.map((x)=> ({ id: x.entityId, title: x.meta?.title || '', category: x.meta?.category || '', location: x.meta?.location || '' }));
    const saved = Array.isArray(body.savedItems) ? body.savedItems : [];
    const searches = Array.isArray(body.searchHistory) ? body.searchHistory : [];
    const recentIds = new Set(recent.map((x)=> String(x.id || x._id || x)));

    const signals = [
      ...recent.flatMap((x)=> tokenise([x.title,x.category,x.location].join(' '))),
      ...saved.flatMap((x)=> tokenise([x.title,x.category,x.location].join(' '))),
      ...searches.flatMap(tokenise)
    ];
    const weights = signals.reduce((acc, t)=> (acc[t]=(acc[t]||0)+1, acc), {});

    const listings = await Listing.find({ status: { $in: ['active','paused','ended','sold'] } }).populate('owner', 'name verified seller').sort({ createdAt: -1 }).limit(150).lean();
    const scored = listings.map((item)=>{
      const tokens = tokenise([item.name||item.title, item.description||'', item.category||'', item.location||''].join(' '));
      let score = 0;
      tokens.forEach((t)=>{ score += (weights[t]||0) * 3; });
      if (item.owner?.verified) score += 8;
      if (item.allowOffers) score += 3;
      if (Array.isArray(item.images) && item.images.length) score += 2;
      if (recentIds.has(String(item._id))) score -= 30;
      const ageDays = (Date.now() - new Date(item.createdAt || 0).getTime()) / (1000*60*60*24);
      if (Number.isFinite(ageDays)) score += Math.max(0, 18 - ageDays);
      return { item, score };
    }).filter((x)=> x.score > 0 && !recentIds.has(String(x.item._id))).sort((a,b)=> b.score - a.score).slice(0,12);

    res.json({ ok:true, recommendations: scored.map((x)=> x.item) });
  } catch (e) { next(e); }
});

module.exports = router;
