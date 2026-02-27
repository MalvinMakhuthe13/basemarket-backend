const mongoose = require("mongoose");

const enquirySchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // who contacted
    name: { type: String, required: true },
    contact: { type: String, required: true }, // phone or email
    message: { type: String, required: true },

    // seller actions
    status: { type: String, enum: ["new", "replied", "closed"], default: "new" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Enquiry", enquirySchema);