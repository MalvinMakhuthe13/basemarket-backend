const mongoose = require("mongoose");

const BidSchema = new mongoose.Schema({
  bidder: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const ListingSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // flexible fields so your current frontend keeps working
  title: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" },
  description: { type: String, trim: true, default: "" },
  price: { type: Number, default: 0 },               // used for "sell" price or auction starting bid
  currency: { type: String, default: "ZAR" },
  category: { type: String, default: "sell" },       // sell | request | auction | etc.
  images: { type: [String], default: [] },
  location: { type: String, default: "" },

  // ✅ ===== FOOD / MARKET (NEW) =====
  // This is what your frontend needs to show "View catalogue"
  menuLink: { type: String, trim: true, default: "" },     // catalogue/menu URL
  foodType: { type: String, trim: true, default: "" },     // restaurant | grocery (optional)
  foodUnit: { type: String, trim: true, default: "" },     // e.g. "plate", "kg" (optional)
  foodSpecial: { type: String, trim: true, default: "" },  // optional

  // ===== AUCTIONS =====
  auctionStart: { type: Date, default: null },
  auctionEnd: { type: Date, default: null },
  startingBid: { type: Number, default: 0 },
  currentBid: { type: Number, default: 0 },
  bids: { type: [BidSchema], default: [] },
  bidsCount: { type: Number, default: 0 },

  // keep listing visible after auction ends; UI decides "Ended" based on auctionEnd
  status: { type: String, enum: ["active", "ended", "sold", "deleted"], default: "active" },
}, { timestamps: true });

// keep bidsCount in sync
ListingSchema.pre("save", function(next) {
  try {
    if (Array.isArray(this.bids)) this.bidsCount = this.bids.length;
  } catch (_) {}
  next();
});

module.exports = mongoose.model("Listing", ListingSchema);