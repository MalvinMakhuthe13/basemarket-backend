const mongoose = require("mongoose");

const BidSchema = new mongoose.Schema({
  bidder: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const ListingSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" },
  description: { type: String, trim: true, default: "" },
  price: { type: Number, default: 0 },
  currency: { type: String, default: "ZAR" },
  category: { type: String, default: "sell" },
  images: { type: [String], default: [] },
  location: { type: String, default: "" },
  deliveryType: { type: String, enum: ['meetup','delivery','both','digital'], default: 'both' },
  allowOffers: { type: Boolean, default: true },
  allowTrade: { type: Boolean, default: false },
  allowBundles: { type: Boolean, default: false },

  menuLink: { type: String, trim: true, default: "" },
  foodType: { type: String, trim: true, default: "" },
  foodUnit: { type: String, trim: true, default: "" },
  foodSpecial: { type: String, trim: true, default: "" },

  auctionStart: { type: Date, default: null },
  auctionEnd: { type: Date, default: null },
  startingBid: { type: Number, default: 0 },
  currentBid: { type: Number, default: 0 },
  bids: { type: [BidSchema], default: [] },
  bidsCount: { type: Number, default: 0 },

  status: { type: String, enum: ["active", "ended", "sold", "deleted", 'paused'], default: "active" },
}, { timestamps: true });

ListingSchema.pre("save", function(next) {
  try {
    if (Array.isArray(this.bids)) this.bidsCount = this.bids.length;
    if (!this.title && this.name) this.title = this.name;
    if (!this.name && this.title) this.name = this.title;
  } catch (_) {}
  next();
});

module.exports = mongoose.model("Listing", ListingSchema);
