function pickListingTitle(listing) {
  return listing?.title || listing?.name || "Listing";
}

module.exports = { pickListingTitle };
