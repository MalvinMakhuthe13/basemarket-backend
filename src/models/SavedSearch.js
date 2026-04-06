const mongoose = require('mongoose');

const SavedSearchSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, default: '' },
  query: { type: String, default: '' },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  emailAlertsEnabled: { type: Boolean, default: true },
  pushAlertsEnabled: { type: Boolean, default: false },
  homepageEnabled: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  lastMatchedListingIds: { type: [String], default: [] },
  lastAlertedListingIds: { type: [String], default: [] },
  freshMatchCount: { type: Number, default: 0 },
  totalMatchCount: { type: Number, default: 0 },
  lastCheckedAt: { type: Date, default: null },
  lastAlertedAt: { type: Date, default: null },
}, { timestamps: true });

SavedSearchSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('SavedSearch', SavedSearchSchema);
