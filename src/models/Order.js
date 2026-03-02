const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  qty: { type: Number, default: 1 },
  mode: { type: String, default: "item" },
  contact: { type: String, default: "" },
  address: { type: String, default: "" },
  notes: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);
