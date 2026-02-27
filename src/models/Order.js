const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    mode: { type: String, enum: ["item", "food", "ticket"], default: "item" },
    qty: { type: Number, default: 1 },

    contact: { type: String, required: true },
    address: { type: String, default: "" },
    notes: { type: String, default: "" },

    status: { type: String, enum: ["placed", "confirmed", "cancelled", "completed"], default: "placed" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
