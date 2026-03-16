const mongoose = require('mongoose');

const PushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  subscription: { type: mongoose.Schema.Types.Mixed, required: true },
  userAgent: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  lastSuccessfulAt: { type: Date, default: null },
  lastFailureAt: { type: Date, default: null },
  lastFailureReason: { type: String, default: '' },
}, { timestamps: true });

PushSubscriptionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
