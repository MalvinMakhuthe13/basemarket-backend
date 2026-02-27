const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phone: {
    number: String,
    verified: { type: Boolean, default: false }
  },
  seller: {
    status: {
      type: String,
      enum: ["none", "pending", "verified", "rejected"],
      default: "none"
    }
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);