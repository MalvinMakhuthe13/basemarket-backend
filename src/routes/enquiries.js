const express = require("express");
const router = express.Router();

const Enquiry = require("../models/Enquiry");
const Listing = require("../models/Listing");
const auth = require("../middleware/auth");

// Anyone can enquire (no login required)
router.post("/:listingId", async (req, res) => {
  try {
    const { name, contact, message } = req.body;
    if (!name || !contact || !message) {
      return res.status(400).json({ message: "Name, contact and message are required" });
    }

    const listing = await Listing.findById(req.params.listingId);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const enquiry = await Enquiry.create({
      listing: listing._id,
      seller: listing.owner,
      name,
      contact,
      message,
    });

    res.json({ message: "Enquiry sent ✅", enquiry });
  } catch (e) {
    res.status(500).json({ message: "Failed to send enquiry" });
  }
});

// Seller inbox (must be logged in)
router.get("/mine", auth, async (req, res) => {
  try {
    const items = await Enquiry.find({ seller: req.user.id })
      .sort({ createdAt: -1 })
      .populate("listing", "data");

    res.json(items);
  } catch (e) {
    res.status(500).json({ message: "Failed to load inbox" });
  }
});

// Seller update status
router.patch("/:id", auth, async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await Enquiry.findOneAndUpdate(
      { _id: req.params.id, seller: req.user.id },
      { status },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: "Failed to update" });
  }
});

module.exports = router;