const Listing = require('../models/Listing');

function lower(v='') { return String(v || '').toLowerCase(); }
function tokenise(text='') {
  return [...new Set(lower(text).replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter((x)=>x && x.length>1))];
}

function listingMatchesFilters(item, filters={}) {
  if (!item) return false;
  const price = Number(item.price || 0);
  const delivery = String(item.deliveryType || 'both');
  const hasPhotos = Array.isArray(item.images) ? item.images.filter(Boolean).length > 0 : false;
  const verified = !!(item.owner?.verified || item.ownerVerified);
  if (filters.delivery && filters.delivery !== 'all') {
    const ok = delivery === filters.delivery || (filters.delivery === 'meetup' && delivery === 'both') || (filters.delivery === 'delivery' && delivery === 'both');
    if (!ok) return false;
  }
  if (filters.min !== '' && Number.isFinite(Number(filters.min)) && price < Number(filters.min)) return false;
  if (filters.max !== '' && Number.isFinite(Number(filters.max)) && price > Number(filters.max)) return false;
  if (filters.verified && !verified) return false;
  if (filters.photos && !hasPhotos) return false;
  if (filters.offers && !(item.allowOffers || lower(item.category) === 'trade')) return false;
  if (filters.categories && Array.isArray(filters.categories) && filters.categories.length) {
    if (!filters.categories.map(lower).includes(lower(item.category || item.type || ''))) return false;
  }
  return true;
}

function listingMatchesQuery(item, query='') {
  const q = String(query || '').trim();
  if (!q) return true;
  const hay = lower([item.name, item.title, item.description, item.category, item.type, item.location].join(' '));
  return tokenise(q).every((t)=> hay.includes(t));
}

async function fetchListingUniverse(limit=250) {
  return Listing.find({ status: { $in: ['active','paused','ended','sold'] } })
    .populate('owner', 'name verified seller')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

function evaluateSavedSearch(savedSearch, listings) {
  const matches = listings.filter((item)=> listingMatchesQuery(item, savedSearch.query) && listingMatchesFilters(item, savedSearch.filters || {}));
  const previous = new Set((savedSearch.lastMatchedListingIds || []).map(String));
  const fresh = matches.filter((item)=> !previous.has(String(item._id)));
  return {
    totalCount: matches.length,
    freshCount: fresh.length,
    matches,
    fresh,
    matchIds: matches.map((x)=> String(x._id)),
    freshIds: fresh.map((x)=> String(x._id)),
  };
}

module.exports = {
  tokenise,
  listingMatchesFilters,
  listingMatchesQuery,
  fetchListingUniverse,
  evaluateSavedSearch,
};
