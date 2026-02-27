const express = require("express");
const Listing = require("../models/Listing");
const auth = require("../middleware/auth");

const router = express.Router();

// CREATE LISTING
router.post("/", auth, async (req, res) => {
  try {
    const listing = await Listing.create({ 
        owner: req.user.id,
        data: req.body 
    })

    res.json(listing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET ALL LISTINGS
router.get("/", async (req, res) => {
  const listings = await Listing.find().populate("owner", "name");
  res.json(listings);
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