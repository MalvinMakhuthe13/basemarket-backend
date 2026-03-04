const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  qty: { type: Number, default: 1 },
  mode: { type: String, default: "item" },

  // Buyer-provided details (MUST NOT be shown to seller unless released)
  contact: { type: String, default: "" },
  address: { type: String, default: "" },

  // Privacy gate (new)
  contactReleased: { type: Boolean, default: false },
  contactReleasedAt: { type: Date, default: null },

  notes: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);