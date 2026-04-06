const mongoose = require("mongoose");

const EmailVerifyTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("EmailVerifyToken", EmailVerifyTokenSchema);
