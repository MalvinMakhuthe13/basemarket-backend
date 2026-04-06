const mongoose = require('mongoose');

const OfferSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  message: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'countered', 'expired', 'cancelled'], default: 'pending', index: true },
  expiresAt: { type: Date, default: null },
  counterAmount: { type: Number, default: null },
  acceptedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
}, { timestamps: true });

OfferSchema.index({ seller: 1, status: 1, createdAt: -1 });
OfferSchema.index({ buyer: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Offer', OfferSchema);
