const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // store everything from frontend safely
  data: { type: mongoose.Schema.Types.Mixed, required: true },

}, { timestamps: true });


module.exports = mongoose.model("Listing", listingSchema); 