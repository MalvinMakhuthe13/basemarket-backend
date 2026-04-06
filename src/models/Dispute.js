const mongoose = require('mongoose');

const DisputeMessageSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorType: { type: String, enum: ['buyer', 'seller', 'admin', 'system'], default: 'system' },
  text: { type: String, trim: true, default: '' },
  attachments: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const DisputeSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['open', 'under_review', 'resolved', 'dismissed'], default: 'open', index: true },
  reason: { type: String, trim: true, required: true },
  resolution: {
    outcome: { type: String, enum: ['refund_buyer', 'release_seller', 'partial_refund', 'cancelled', 'other', ''], default: '' },
    note: { type: String, trim: true, default: '' },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, trim: true, default: '' },
  },
  payoutFrozen: { type: Boolean, default: true },
  evidence: { type: [String], default: [] },
  messages: { type: [DisputeMessageSchema], default: [] },
}, { timestamps: true });

DisputeSchema.index({ order: 1, status: 1 });
DisputeSchema.index({ buyer: 1, createdAt: -1 });
DisputeSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.model('Dispute', DisputeSchema);
