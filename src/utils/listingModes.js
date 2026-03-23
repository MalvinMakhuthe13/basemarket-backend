const LISTING_MODE_DEFINITIONS = Object.freeze({
  sell: {
    key: 'sell', aliases: ['sell', 'buy & sell', 'buy&sell', 'for sale', 'sale', 'item'],
    feedLabel: 'For Sale', typeLabel: 'Buy & Sell', modeLabel: 'For sale', actionLabel: 'Buy now'
  },
  request: {
    key: 'request', aliases: ['request', 'requests', 'wanted', 'need'],
    feedLabel: 'Requests', typeLabel: 'Requests', modeLabel: 'Request', actionLabel: 'Send offer'
  },
  trade: {
    key: 'trade', aliases: ['trade', 'swap', 'swop', 'barter'],
    feedLabel: 'Trade & Swap', typeLabel: 'Trade', modeLabel: 'Trade & swap', actionLabel: 'Offer Trade'
  },
  service: {
    key: 'service', aliases: ['service', 'services', 'business service'],
    feedLabel: 'Services', typeLabel: 'Business Service', modeLabel: 'Service booking', actionLabel: 'Book now'
  },
  rentals: {
    key: 'rentals', aliases: ['rentals', 'rental', 'rent'],
    feedLabel: 'Rentals', typeLabel: 'Rentals', modeLabel: 'Rental enquiry', actionLabel: 'Enquire rental'
  },
  events: {
    key: 'events', aliases: ['events', 'event', 'ticket', 'tickets'],
    feedLabel: 'Events', typeLabel: 'Events', modeLabel: 'Event booking', actionLabel: 'Buy ticket'
  },
  food: {
    key: 'food', aliases: ['food', 'food & market', 'food and market', 'market'],
    feedLabel: 'Food & Market', typeLabel: 'Food & Market', modeLabel: 'Food order', actionLabel: 'View catalogue'
  },
  jobs: {
    key: 'jobs', aliases: ['jobs', 'job', 'work', 'gig', 'gigs', 'work & gigs'],
    feedLabel: 'Work & Gigs', typeLabel: 'Work & Gigs', modeLabel: 'Job application', actionLabel: 'Apply now'
  },
  places: {
    key: 'places', aliases: ['places', 'place', 'venue', 'venues'],
    feedLabel: 'Places', typeLabel: 'Places', modeLabel: 'Place enquiry', actionLabel: 'Enquire'
  },
  auction: {
    key: 'auction', aliases: ['auction', 'auctions', 'bid', 'bidding'],
    feedLabel: 'Auctions', typeLabel: 'Auction', modeLabel: 'Auction bid', actionLabel: 'Place bid'
  }
});

function normalizeListingMode(mode = '', fallback = 'sell') {
  const raw = String(mode || '').trim().toLowerCase();
  if (!raw) return fallback;
  for (const def of Object.values(LISTING_MODE_DEFINITIONS)) {
    if (def.key === raw || (def.aliases || []).includes(raw)) return def.key;
  }
  return fallback;
}

function getListingTypeMeta(mode = '', fallback = 'sell') {
  const key = normalizeListingMode(mode, fallback);
  return LISTING_MODE_DEFINITIONS[key] || LISTING_MODE_DEFINITIONS[fallback] || LISTING_MODE_DEFINITIONS.sell;
}

function enrichListingModeFields(listing) {
  if (!listing || typeof listing !== 'object') return listing;
  const mode = normalizeListingMode(listing.listingMode || listing.category || listing.type || listing.typeKey || listing.mode || 'sell');
  const meta = getListingTypeMeta(mode);
  return {
    ...listing,
    listingMode: mode,
    listingModeMeta: meta,
    category: mode,
  };
}

module.exports = {
  LISTING_MODE_DEFINITIONS,
  normalizeListingMode,
  getListingTypeMeta,
  enrichListingModeFields,
};
