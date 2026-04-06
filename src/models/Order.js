const mongoose = require("mongoose");
const { STATUS } = require('../utils/orderState');

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
  status: {
    type: String,
    enum: Object.values(STATUS),
    default: STATUS.CREATED,
    index: true,
  },

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
  sellerPreparingAt: { type: Date, default: null },
  releaseCode: { type: String, default: "" },
  sellerMarkedShippedAt: { type: Date, default: null },
  buyerConfirmedAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
  disputedAt: { type: Date, default: null },
  disputeReason: { type: String, default: "" },
  paymentLockedAt: { type: Date, default: null },
  payfastItnVerified: { type: Boolean, default: false },
  lastPayfastPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  timeline: { type: [OrderTimelineSchema], default: [] },
  buyerMeetupConfirmedAt: { type: Date, default: null },
  sellerMeetupConfirmedAt: { type: Date, default: null },
  payoutReadyAt: { type: Date, default: null },
  payoutPaidAt: { type: Date, default: null },
  refundProcessedAt: { type: Date, default: null },
  statusHistory: {
    type: [{ status: { type: String, default: '' }, at: { type: Date, default: Date.now }, actor: { type: String, default: 'system' }, note: { type: String, default: '' } }],
    default: [],
  },
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);
