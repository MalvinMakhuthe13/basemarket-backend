const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { timestamps: true }
);

MessageSchema.index({ conversation: 1, createdAt: 1 });

module.exports = mongoose.model("Message", MessageSchema);
