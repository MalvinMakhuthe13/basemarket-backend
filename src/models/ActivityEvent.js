const mongoose = require('mongoose');

const ActivityEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, index: true },
  entityType: { type: String, default: 'listing', index: true },
  entityId: { type: String, default: '', index: true },
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null, index: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

ActivityEventSchema.index({ user: 1, createdAt: -1 });
ActivityEventSchema.index({ user: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityEvent', ActivityEventSchema);
