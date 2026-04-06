const mongoose = require('mongoose');

const FraudFlagSchema = new mongoose.Schema({
  entityType: { type: String, enum: ['order','listing','user','payment'], required: true },
  entityId: { type: String, required: true, index: true },
  severity: { type: String, enum: ['low','medium','high'], default: 'medium' },
  reason: { type: String, required: true },
  status: { type: String, enum: ['open','reviewed','resolved','dismissed'], default: 'open' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: String, default: 'system' },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('FraudFlag', FraudFlagSchema);
