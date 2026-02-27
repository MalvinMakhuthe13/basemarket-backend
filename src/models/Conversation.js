const mongoose = require("mongoose");

const ConversationSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Ensure one conversation per (listing + buyer) (seller is implied by listing owner)
ConversationSchema.index({ listing: 1, buyer: 1 }, { unique: true });

module.exports = mongoose.model("Conversation", ConversationSchema);
