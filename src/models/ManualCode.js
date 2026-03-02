const mongoose = require("mongoose");

const manualCodeSchema = new mongoose.Schema({
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  usedAt: { type: Date, default: null },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { versionKey: false });

module.exports = mongoose.model("ManualCode", manualCodeSchema);
