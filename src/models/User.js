const mongoose = require("mongoose");

const PhoneSchema = new mongoose.Schema({
  number: { type: String, default: "" },
  verified: { type: Boolean, default: false },
}, { _id: false });

const SellerSchema = new mongoose.Schema({
  status: { type: String, enum: ["none", "pending", "approved", "rejected"], default: "none" },
  requestedAt: { type: Date },
  decidedAt: { type: Date },
  decisionReason: { type: String, default: "" },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },

  emailVerified: { type: Boolean, default: false },
  verified: { type: Boolean, default: false }, // trust verification badge
  verifiedAt: { type: Date },
  verifiedNote: { type: String, default: "" },

  phone: { type: PhoneSchema, default: () => ({}) },
  seller: { type: SellerSchema, default: () => ({}) },

}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
