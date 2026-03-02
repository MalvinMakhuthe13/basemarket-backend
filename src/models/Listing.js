const mongoose = require("mongoose");

const ListingSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // flexible fields so your current frontend keeps working
  title: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" },
  description: { type: String, trim: true, default: "" },
  price: { type: Number, default: 0 },
  currency: { type: String, default: "ZAR" },
  category: { type: String, default: "sell" },
  images: { type: [String], default: [] },
  location: { type: String, default: "" },

  status: { type: String, enum: ["active", "sold", "deleted"], default: "active" },
}, { timestamps: true });

module.exports = mongoose.model("Listing", ListingSchema);
