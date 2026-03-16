const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, default: 'system', index: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  actionUrl: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  icon: { type: String, default: 'bell' },
  severity: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' },
  readAt: { type: Date, default: null, index: true },
  dedupeKey: { type: String, default: '', index: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
