const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, trim: true },
}, { timestamps: true });

const ConversationSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  messages: { type: [MessageSchema], default: [] },
  lastMessage: { type: String, default: "" },
  lastMessageAt: { type: Date },
  buyerLastReadAt: { type: Date, default: null },
  sellerLastReadAt: { type: Date, default: null },
}, { timestamps: true });

ConversationSchema.index({ listing: 1, buyer: 1, seller: 1, order: 1 }, { unique: true });

module.exports = mongoose.model("Conversation", ConversationSchema);
