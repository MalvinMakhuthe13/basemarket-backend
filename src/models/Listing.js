const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Keep common fields explicitly (helps later)
    name: String,
    type: String,
    price: String,
    location: String,
    image: String,
  },
  {
    timestamps: true,
    strict: false, // ✅ keeps ALL extra fields your frontend sends
  }
);

module.exports = mongoose.model("Listing", listingSchema);