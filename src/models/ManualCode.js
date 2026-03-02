const mongoose = require("mongoose");

const ManualCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("ManualCode", ManualCodeSchema);
