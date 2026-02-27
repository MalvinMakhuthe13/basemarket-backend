const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  emailVerified: { type: Boolean, default: false },

  phone: {
    number: { type: String, default: "" },
    verified: { type: Boolean, default: false },
  },

  // Phone OTP (backend-generated; integrate with SMS provider later)
  phoneOtp: {
    codeHash: { type: String, default: "" },
    expiresAt: { type: Date, default: null },
    lastSentAt: { type: Date, default: null },
  },

  seller: {
    status: {
      type: String,
      enum: ["none", "pending", "verified", "rejected"],
      default: "none"
    },
    fullname: { type: String, default: "" },
    area: { type: String, default: "" },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" },
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
