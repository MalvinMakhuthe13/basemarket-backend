const express = require("express");
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Listing = require("../models/Listing");
const { requireAuth } = require("../middleware/auth");
const { normalizeListingMode, enrichListingModeFields } = require("../utils/listingModes");
const { buildTrustProfilesForUsers } = require("../utils/trust");
const { uploadImage, deleteImage } = require("../config/cloudinary");

const router = express.Router();

// ── Image validation ────────────────────────────────────────────────────────
const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png',  bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

function validateMagicBytesBuffer(buffer) {
  if (!buffer || buffer.length < 8) return false;
  return IMAGE_SIGNATURES.some(sig => sig.bytes.every((b, i) => buffer[i] === b));
}

// ── Multer: memory storage (no disk writes — Cloudinary handles persistence) ─
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function asDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function buildSort(sortKey = 'newest') {
  const key = String(sortKey || 'newest').trim().toLowerCase();
  switch (key) {
    case 'oldest':     return { isSponsored: -1, sponsoredPriority: -1, createdAt: 1 };
    case 'price_low':
    case 'price_low_to_high':
    case 'low_to_high':  return { isSponsored: -1, sponsoredPriority: -1, price: 1,  createdAt: -1 };
    case 'price_high':
    case 'price_high_to_low':
    case 'high_to_low':  return { isSponsored: -1, sponsoredPriority: -1, price: -1, createdAt: -1 };
    default:           return { isSponsored: -1, sponsoredPriority: -1, createdAt: -1 };
  }
}

function normalizeListingInput(b = {}) {
  const category = normalizeListingMode(b.category || b.type || b.typeKey || b.mode || "sell");
  const auctionStart = asDate(b.auctionStart);
  const auctionEnd   = asDate(b.auctionEnd);
  const price        = Number(b.price || 0);
  const startingBid  = Number(b.startingBid || price || 0);
  const currentBid   = Number(b.currentBid || startingBid || 0);
  const menuLink     = String(b.menuLink  || "").trim();
  const foodType     = String(b.foodType  || "").trim();
  const foodUnit     = String(b.foodUnit  || "").trim();
  const foodSpecial  = String(b.foodSpecial || "").trim();
  const requestedDelivery = String(b.deliveryType || '').toLowerCase();
  const deliveryType = ['meetup','delivery','both','digital'].includes(requestedDelivery)
    ? requestedDelivery
    : (category === 'events' || category === 'jobs' ? 'digital' : 'both');

  return {
    title: b.title || b.name || "",
    name: b.name || b.title || "",
    description: b.description || "",
    price,
    currency: b.currency || "ZAR",
    category,
    location: b.location || "",
    menuLink, foodType, foodUnit, foodSpecial,
    auctionStart: category === "auction" ? auctionStart : null,
    auctionEnd:   category === "auction" ? auctionEnd   : null,
    startingBid:  category === "auction" ? startingBid  : 0,
    currentBid:   category === "auction" ? currentBid   : 0,
    bids: [],
    bidsCount: 0,
    status: "active",
    deliveryType,
    allowOffers:  b.allowOffers  !== false,
    allowTrade:   !!b.allowTrade,
    allowBundles: !!b.allowBundles,
  };
}

function normalizeListing(it, trustProfiles = {}) {
  if (!it || typeof it !== 'object') return it;
  if (it.bidsCount == null && Array.isArray(it.bids)) it.bidsCount = it.bids.length;
  if (String(it.category || "").toLowerCase() === "auction" && it.auctionEnd) {
    const end = new Date(it.auctionEnd);
    if (Number.isFinite(end.getTime()) && Date.now() > end.getTime()) {
      if (it.status !== "deleted" && it.status !== "sold") it.status = "ended";
    }
  }
  if (it.menuLink   == null) it.menuLink   = "";
  if (it.foodType   == null) it.foodType   = "";
  if (it.foodUnit   == null) it.foodUnit   = "";
  if (it.foodSpecial == null) it.foodSpecial = "";
  if (!it.deliveryType) it.deliveryType = 'both';
  const ownerId = String(it.owner?._id || it.owner?.id || it.owner || '');
  if (ownerId && trustProfiles[ownerId]) it.trustProfile = trustProfiles[ownerId];
  return enrichListingModeFields(it);
}

// ── GET /api/listings — paginated feed ──────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const skip  = (page - 1) * limit;
    const sortKey = String(req.query.sort || 'newest');

    const categoryFilter = req.query.category && req.query.category !== 'all'
      ? { category: String(req.query.category).toLowerCase().trim() }
      : {};

    const now = new Date();
    const activeStatuses = ['active', 'ended', 'sold'];
    const baseFilter = {
      $and: [
        {
          $or: [
            {
              sourceType: 'sponsored',
              moderationStatus: 'approved',
              status: { $in: activeStatuses },
              $and: [
                { $or: [{ sponsoredStartsAt: null }, { sponsoredStartsAt: { $exists: false } }, { sponsoredStartsAt: { $lte: now } }] },
                { $or: [{ sponsoredEndsAt: null }, { sponsoredEndsAt: { $exists: false } }, { sponsoredEndsAt: { $gte: now } }] },
              ]
            },
            {
              $or: [{ sourceType: 'user' }, { sourceType: { $exists: false } }],
              $and: [
                { $or: [{ moderationStatus: 'approved' }, { moderationStatus: { $exists: false } }] },
                { $or: [{ status: { $in: activeStatuses } }, { status: { $exists: false } }] },
              ]
            }
          ]
        },
        categoryFilter,
      ],
    };

    const [items, total] = await Promise.all([
      Listing.find(baseFilter)
        .populate("owner", "name email verified seller phone role")
        .sort(buildSort(sortKey))
        .skip(skip)
        .limit(limit)
        .lean(),
      Listing.countDocuments(baseFilter),
    ]);

    const trustProfiles = await buildTrustProfilesForUsers(
      (items || []).map(it => it.owner).filter(Boolean)
    );

    res.json({
      listings: (items || []).map(it => normalizeListing(it, trustProfiles)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
      sort: sortKey,
    });
  } catch (e) { next(e); }
});

// ── GET /api/listings/:id — single listing ───────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const item = await Listing.findById(req.params.id)
      .populate("owner", "name email verified seller phone role")
      .lean();

    if (!item) return res.status(404).json({ message: "Listing not found" });

    // Treat deleted listings as not found for public requests
    if (item.status === 'deleted') return res.status(404).json({ message: "Listing not found" });

    const trustProfiles = await buildTrustProfilesForUsers(
      [item.owner].filter(Boolean)
    );

    res.json(normalizeListing(item, trustProfiles));
  } catch (e) { next(e); }
});

// ── POST /api/listings/upload — image upload to Cloudinary ──────────────────
router.post('/upload', requireAuth, upload.array('images', 6), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'No files received.' });

    // Validate magic bytes on each buffer
    const invalid = files.filter(f => !validateMagicBytesBuffer(f.buffer));
    if (invalid.length > 0) {
      return res.status(400).json({ message: 'One or more files failed image validation. Only real image files are accepted.' });
    }

    // Upload all files (to Cloudinary if configured, otherwise local disk)
    const urls = await Promise.all(
      files.map(f => uploadImage(f.buffer, 'listings', req, f.originalname))
    );

    res.json({ ok: true, images: urls });
  } catch (e) { next(e); }
});

// ── POST /api/listings — create listing ─────────────────────────────────────
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const input = normalizeListingInput(b);
    const doc = await Listing.create({
      owner: req.user.id,
      sourceType: 'user',
      moderationStatus: 'approved',
      ...input,
      images: Array.isArray(b.images) ? b.images : (b.image ? [b.image] : []),
    });

    const populated = await Listing.findById(doc._id)
      .populate("owner", "name email verified seller phone")
      .lean();

    res.json(normalizeListing(populated));
  } catch (e) { next(e); }
});

// ── PATCH /api/listings/:id — update listing ─────────────────────────────────
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await Listing.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Listing not found" });
    if (String(item.owner) !== String(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ message: "Not allowed" });

    const b = req.body || {};
    if (b.title       != null) item.title       = String(b.title);
    if (b.name        != null) item.name        = String(b.name);
    if (b.description != null) item.description = String(b.description);
    if (b.price       != null) item.price       = Number(b.price || 0);
    if (b.location    != null) item.location    = String(b.location);
    if (Array.isArray(b.images)) item.images    = b.images;
    if (b.menuLink    != null) item.menuLink    = String(b.menuLink  || "").trim();
    if (b.foodType    != null) item.foodType    = String(b.foodType  || "").trim();
    if (b.foodUnit    != null) item.foodUnit    = String(b.foodUnit  || "").trim();
    if (b.foodSpecial != null) item.foodSpecial = String(b.foodSpecial || "").trim();
    if (b.deliveryType != null && ['meetup','delivery','both','digital'].includes(String(b.deliveryType)))
      item.deliveryType = String(b.deliveryType);
    if (b.allowOffers  != null) item.allowOffers  = !!b.allowOffers;
    if (b.allowTrade   != null) item.allowTrade   = !!b.allowTrade;
    if (b.allowBundles != null) item.allowBundles = !!b.allowBundles;
    if (b.status != null && ['active','ended','sold','deleted','paused'].includes(String(b.status)))
      item.status = String(b.status);

    if (String(item.category || "").toLowerCase() === "auction") {
      if (b.auctionStart !== undefined) item.auctionStart = asDate(b.auctionStart);
      if (b.auctionEnd   !== undefined) item.auctionEnd   = asDate(b.auctionEnd);
      if (b.startingBid  !== undefined) item.startingBid  = Number(b.startingBid || 0);
      if (b.currentBid   !== undefined) item.currentBid   = Number(b.currentBid  || 0);
    }

    await item.save();
    const populated = await Listing.findById(item._id)
      .populate("owner", "name email verified seller phone")
      .lean();
    res.json(normalizeListing(populated));
  } catch (e) { next(e); }
});

// ── DELETE /api/listings/:id — soft delete ───────────────────────────────────
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const item = await Listing.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Listing not found' });
    if (String(item.owner) !== String(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not allowed' });

    // Clean up Cloudinary images on delete
    if (Array.isArray(item.images)) {
      await Promise.all(item.images.map(url => deleteImage(url)));
    }

    item.status = 'deleted';
    await item.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── POST /api/listings/:id/bid — place auction bid ───────────────────────────
router.post("/:id/bid", requireAuth, async (req, res, next) => {
  try {
    const listingId = req.params.id;
    const amount = Number(req.body?.amount);

    if (!Number.isFinite(amount) || amount <= 0)
      return res.status(400).json({ message: "Bid amount must be a positive number." });

    const item = await Listing.findById(listingId);
    if (!item) return res.status(404).json({ message: "Listing not found" });

    if (String(item.category || "").toLowerCase() !== "auction")
      return res.status(400).json({ message: "This listing is not an auction." });

    const now = new Date();
    if (item.auctionStart && now < item.auctionStart)
      return res.status(400).json({ message: "Bid window closed (auction not started yet)." });
    if (item.auctionEnd && now > item.auctionEnd) {
      item.status = "ended";
      await item.save();
      return res.status(400).json({ message: "Bid window closed (auction ended)." });
    }

    const current = Number(item.currentBid || item.startingBid || item.price || 0);
    if (amount <= current)
      return res.status(400).json({ message: `Bid must be higher than current bid (${current}).` });

    item.currentBid = amount;
    item.bids.push({ bidder: req.user.id, amount, createdAt: now });
    await item.save();

    const populated = await Listing.findById(item._id)
      .populate("owner", "name email verified seller phone")
      .lean();
    res.json(normalizeListing(populated));
  } catch (e) { next(e); }
});

module.exports = router;
