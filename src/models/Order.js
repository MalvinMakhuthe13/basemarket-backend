const mongoose = require("mongoose");

const OrderTimelineSchema = new mongoose.Schema({
  type: { type: String, default: "note" },
  message: { type: String, default: "" },
  at: { type: Date, default: Date.now },
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  qty: { type: Number, default: 1 },
  mode: { type: String, default: "item" },

  contact: { type: String, default: "" },
  address: { type: String, default: "" },
  contactReleased: { type: Boolean, default: false },
  contactReleasedAt: { type: Date, default: null },
  notes: { type: String, default: "" },

  secureDeal: { type: Boolean, default: false },
  unitPrice: { type: Number, default: 0 },
  shippingFee: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  currency: { type: String, default: "ZAR" },
  gateway: { type: String, default: "" },
  gatewayReference: { type: String, default: "" },
  paymentStatus: { type: String, default: "awaiting_payment", enum: ["awaiting_payment", "paid", "failed", "cancelled", "refunded", "not_applicable"] },
  escrowStatus: { type: String, default: "awaiting_payment", enum: ["awaiting_payment", "holding_pending_payment", "holding", "awaiting_fulfilment", "shipped", "meetup_ready", "delivered", "released", "disputed", "open"] },
  payoutStatus: { type: String, default: "not_ready", enum: ["not_ready", "ready", "paid", "n/a"] },
  deliveryMethod: { type: String, default: "shipping", enum: ["shipping", "meetup", "digital"] },
  destinationCity: { type: String, default: "" },
  courier: { type: mongoose.Schema.Types.Mixed, default: null },
  trackingNumber: { type: String, default: "" },
  releaseCode: { type: String, default: "" },
  sellerMarkedShippedAt: { type: Date, default: null },
  buyerConfirmedAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
  disputedAt: { type: Date, default: null },
  disputeReason: { type: String, default: "" },
  timeline: { type: [OrderTimelineSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);
