const express = require("express");
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Listing = require("../models/Listing");
const { requireAuth } = require("../middleware/auth");
const { normalizeListingMode, enrichListingModeFields } = require("../utils/listingModes");
const { buildTrustProfilesForUsers } = require("../utils/trust");

const router = express.Router();
const uploadDir = path.join(process.cwd(), 'uploads', 'listings');
fs.mkdirSync(uploadDir, { recursive: true });

// Magic bytes signatures for allowed image types
const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png',  bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
];

function validateMagicBytes(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    return IMAGE_SIGNATURES.some(sig =>
      sig.bytes.every((b, i) => buf[i] === b)
    );
  } catch (_) {
    return false;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${safeExt}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  }
});

function asDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toPublicImageUrls(req, files = []) {
  const base = `${req.protocol}://${req.get('host')}`;
  return files.map((file) => `${base}/uploads/listings/${file.filename}`);
}

function normalizeListingInput(b = {}) {
  const category = normalizeListingMode(b.category || b.type || b.typeKey || b.mode || "sell");
  const auctionStart = asDate(b.auctionStart);
  const auctionEnd = asDate(b.auctionEnd);
  const price = Number(b.price || 0);
  const startingBid = Number(b.startingBid || price || 0);
  const currentBid = Number(b.currentBid || startingBid || 0);
  const menuLink = String(b.menuLink || "").trim();
  const foodType = String(b.foodType || "").trim();
  const foodUnit = String(b.foodUnit || "").trim();
  const foodSpecial = String(b.foodSpecial || "").trim();
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
    menuLink,
    foodType,
    foodUnit,
    foodSpecial,
    auctionStart: category === "auction" ? auctionStart : null,
    auctionEnd: category === "auction" ? auctionEnd : null,
    startingBid: category === "auction" ? startingBid : 0,
    currentBid: category === "auction" ? currentBid : 0,
    bids: [],
    bidsCount: 0,
    status: "active",
    deliveryType,
    allowOffers: b.allowOffers !== false,
    allowTrade: !!b.allowTrade,
    allowBundles: !!b.allowBundles,
  };
}

router.get("/", async (req, res, next) => {
  try {
    // Pagination: ?page=1&limit=30 (default 30, max 100)
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const skip  = (page - 1) * limit;

    // Optional category filter: ?category=sell
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
                { $or: [{ sponsoredEndsAt: null }, { sponsoredEndsAt: { $exists: false } }, { sponsoredEndsAt: { $gte: now } }] }
              ]
            },
            {
              $or: [{ sourceType: 'user' }, { sourceType: { $exists: false } }],
              $and: [
                { $or: [{ moderationStatus: 'approved' }, { moderationStatus: { $exists: false } }] },
                { $or: [{ status: { $in: activeStatuses } }, { status: { $exists: false } }] }
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
        .sort({ isSponsored: -1, sponsoredPriority: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Listing.countDocuments(baseFilter),
    ]);

    const trustProfiles = await buildTrustProfilesForUsers((items || []).map((it) => it.owner).filter(Boolean));
    const normalized = (items || []).map((it) => {
      if (it && typeof it === "object") {
        if (it.bidsCount == null && Array.isArray(it.bids)) it.bidsCount = it.bids.length;
        if (String(it.category || "").toLowerCase() === "auction" && it.auctionEnd) {
          const end = new Date(it.auctionEnd);
          if (Number.isFinite(end.getTime()) && Date.now() > end.getTime()) {
            if (it.status !== "deleted" && it.status !== "sold") it.status = "ended";
          }
        }
        if (it.menuLink == null) it.menuLink = "";
        if (it.foodType == null) it.foodType = "";
        if (it.foodUnit == null) it.foodUnit = "";
        if (it.foodSpecial == null) it.foodSpecial = "";
        if (!it.deliveryType) it.deliveryType = 'both';
        const ownerId = String(it.owner?._id || it.owner?.id || it.owner || '');
        if (ownerId && trustProfiles[ownerId]) it.trustProfile = trustProfiles[ownerId];
      }
      return enrichListingModeFields(it);
    });

    res.json({
      listings: normalized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/upload', requireAuth, upload.array('images', 6), async (req, res) => {
  const files = req.files || [];

  // Validate actual file content (magic bytes) — mimetype alone can be spoofed
  const invalid = files.filter(f => !validateMagicBytes(f.path));
  if (invalid.length > 0) {
    // Delete all uploaded files and reject
    files.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(400).json({ message: 'One or more files failed image validation. Only real image files are accepted.' });
  }

  res.json({ ok: true, images: toPublicImageUrls(req, files) });
});

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

    res.json(enrichListingModeFields(populated));
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const item = await Listing.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Listing not found" });
    if (String(item.owner) !== String(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ message: "Not allowed" });

    const b = req.body || {};
    if (b.title != null) item.title = String(b.title);
    if (b.name != null) item.name = String(b.name);
    if (b.description != null) item.description = String(b.description);
    if (b.price != null) item.price = Number(b.price || 0);
    if (b.location != null) item.location = String(b.location);
    if (Array.isArray(b.images)) item.images = b.images;
    if (b.menuLink != null) item.menuLink = String(b.menuLink || "").trim();
    if (b.foodType != null) item.foodType = String(b.foodType || "").trim();
    if (b.foodUnit != null) item.foodUnit = String(b.foodUnit || "").trim();
    if (b.foodSpecial != null) item.foodSpecial = String(b.foodSpecial || "").trim();
    if (b.deliveryType != null && ['meetup','delivery','both','digital'].includes(String(b.deliveryType))) item.deliveryType = String(b.deliveryType);
    if (b.allowOffers != null) item.allowOffers = !!b.allowOffers;
    if (b.allowTrade != null) item.allowTrade = !!b.allowTrade;
    if (b.allowBundles != null) item.allowBundles = !!b.allowBundles;
    if (b.status != null && ['active','ended','sold','deleted','paused'].includes(String(b.status))) item.status = String(b.status);

    const isAuction = String(item.category || "").toLowerCase() === "auction";
    if (isAuction) {
      if (b.auctionStart !== undefined) item.auctionStart = asDate(b.auctionStart);
      if (b.auctionEnd !== undefined) item.auctionEnd = asDate(b.auctionEnd);
      if (b.startingBid !== undefined) item.startingBid = Number(b.startingBid || 0);
      if (b.currentBid !== undefined) item.currentBid = Number(b.currentBid || 0);
    }

    await item.save();
    const populated = await Listing.findById(item._id)
      .populate("owner", "name email verified seller phone")
      .lean();

    res.json(enrichListingModeFields(populated));
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const item = await Listing.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Listing not found' });
    if (String(item.owner) !== String(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ message: 'Not allowed' });
    item.status = 'deleted';
    await item.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/:id/bid", requireAuth, async (req, res, next) => {
  try {
    const listingId = req.params.id;
    const amount = Number(req.body?.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Bid amount must be a positive number." });
    }

    const item = await Listing.findById(listingId);
    if (!item) return res.status(404).json({ message: "Listing not found" });

    if (String(item.category || "").toLowerCase() !== "auction") {
      return res.status(400).json({ message: "This listing is not an auction." });
    }

    const now = new Date();
    if (item.auctionStart && now < item.auctionStart) return res.status(400).json({ message: "Bid window closed (auction not started yet)." });
    if (item.auctionEnd && now > item.auctionEnd) {
      item.status = "ended";
      await item.save();
      return res.status(400).json({ message: "Bid window closed (auction ended)." });
    }

    const current = Number(item.currentBid || item.startingBid || item.price || 0);
    if (amount <= current) return res.status(400).json({ message: `Bid must be higher than current bid (${current}).` });

    item.currentBid = amount;
    item.bids.push({ bidder: req.user.id, amount, createdAt: now });
    await item.save();
    const populated = await Listing.findById(item._id).populate("owner", "name email verified seller phone").lean();
    res.json(enrichListingModeFields(populated));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
