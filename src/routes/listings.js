const express = require("express");
const Listing = require("../models/Listing");
const auth = require("../middleware/auth");
const requirePhoneVerified = require("../middleware/requirePhoneVerified");

const router = express.Router();

// CREATE LISTING
router.post("/", auth, requirePhoneVerified, async (req, res) => {
  try {
    // Store listing fields flat for easier querying.
    // (We still accept any extra fields because Listing schema uses strict:false)
    const listing = await Listing.create({
      owner: req.user.id,
      ...req.body,
    });

    res.json(listing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET ALL LISTINGS
router.get("/", async (req, res) => {
  const listings = await Listing.find().populate("owner", "name emailVerified phone");
  const shaped = listings.map(l => {
    const o = l.owner || {};
    const ownerVerified = Boolean(o.emailVerified || (o.phone && o.phone.verified));
    return {
      ...l.toObject(),
      ownerName: o.name || "",
      ownerVerified
    };
  });
  res.json(shaped);
});

// GET MY LISTINGS
router.get("/mine", auth, async (req, res) => {
  const listings = await Listing.find({ owner: req.user.id });
  res.json(listings);
});

// DELETE LISTING
router.delete("/:id", auth, async (req, res) => {
  const listing = await Listing.findById(req.params.id);

  if (!listing)
    return res.status(404).json({ message: "Listing not found" });

  if (listing.owner.toString() !== req.user.id)
    return res.status(403).json({ message: "Not allowed" });

  await listing.deleteOne();

  res.json({ message: "Listing deleted" });
});

module.exports = router;