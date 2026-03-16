const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const { sendPush } = require('./push');

async function createNotification({ userId, type='system', title, body='', actionUrl='', actionLabel='', icon='bell', severity='info', dedupeKey='', meta={} }) {
  if (!userId || !title) return null;
  const payload = { user: userId, type, title, body, actionUrl, actionLabel, icon, severity, dedupeKey, meta };
  if (dedupeKey) {
    const existing = await Notification.findOne({ user: userId, dedupeKey, readAt: null }).sort({ createdAt: -1 });
    if (existing) return existing;
  }
  return Notification.create(payload);
}

async function pushToUser(userId, payload) {
  if (!userId) return { delivered: 0 };
  const subs = await PushSubscription.find({ user: userId, isActive: true });
  let delivered = 0;
  for (const sub of subs) {
    try {
      await sendPush(sub.subscription, payload);
      sub.lastSuccessfulAt = new Date();
      sub.lastFailureReason = '';
      await sub.save();
      delivered += 1;
    } catch (err) {
      sub.lastFailureAt = new Date();
      sub.lastFailureReason = String(err?.message || err);
      if (err?.statusCode === 404 || err?.statusCode === 410) sub.isActive = false;
      await sub.save().catch(()=>null);
    }
  }
  return { delivered };
}

module.exports = { createNotification, pushToUser };
