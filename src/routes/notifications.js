const express = require("express");
const { requireAuth } = require("../middleware/auth");
const PushSubscription = require("../models/PushSubscription");
const Notification = require("../models/Notification");
const { getPublicKey, sendPush } = require("../utils/push");
const { createNotification } = require("../utils/notifications");

const router = express.Router();

router.get('/center', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const items = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean();
    const unreadCount = await Notification.countDocuments({ user: req.user.id, readAt: null });
    res.json({ ok: true, unreadCount, items });
  } catch (e) { next(e); }
});

router.post('/center/read-all', requireAuth, async (req, res, next) => {
  try {
    const now = new Date();
    await Notification.updateMany({ user: req.user.id, readAt: null }, { $set: { readAt: now } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/center/:id/read', requireAuth, async (req, res, next) => {
  try {
    const item = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { $set: { readAt: new Date() } }, { new: true });
    if (!item) return res.status(404).json({ message: 'Notification not found' });
    res.json({ ok: true, item });
  } catch (e) { next(e); }
});

router.post('/center/test', requireAuth, async (req, res, next) => {
  try {
    const item = await createNotification({ userId: req.user.id, type: 'system_test', title: 'BaseMarket notification center is ready', body: 'You can now track alerts, orders, and messages in one place.', actionUrl: '/', actionLabel: 'Open BaseMarket', icon: 'bell', severity: 'success' });
    res.json({ ok: true, itemId: item?._id || null });
  } catch (e) { next(e); }
});

router.get('/push/public-key', requireAuth, async (_req, res) => {
  res.json({ ok: true, publicKey: getPublicKey(), enabled: !!getPublicKey() });
});

router.post('/push/subscribe', requireAuth, async (req, res, next) => {
  try {
    const subscription = req.body?.subscription;
    if (!subscription?.endpoint) return res.status(400).json({ message: 'Missing push subscription' });
    const item = await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        user: req.user.id,
        endpoint: subscription.endpoint,
        subscription,
        userAgent: String(req.get('user-agent') || ''),
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, itemId: item._id });
  } catch (e) { next(e); }
});

router.post('/push/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ message: 'Missing endpoint' });
    await PushSubscription.findOneAndUpdate({ user: req.user.id, endpoint }, { isActive: false });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/push/test', requireAuth, async (req, res, next) => {
  try {
    const subs = await PushSubscription.find({ user: req.user.id, isActive: true });
    let delivered = 0;
    for (const sub of subs) {
      try {
        await sendPush(sub.subscription, {
          title: 'BaseMarket notifications ready',
          body: 'Push alerts are connected on this device.',
          url: '/',
          tag: 'push-test',
        });
        delivered += 1;
      } catch (_) {}
    }
    await createNotification({ userId: req.user.id, type: 'push_test', title: delivered ? 'Push is connected on this device' : 'Push test sent', body: delivered ? 'Your browser is subscribed for BaseMarket alerts.' : 'No active browser subscription was found.', actionUrl: '/', icon: 'bell', severity: delivered ? 'success' : 'warning' }).catch(()=>null);
    res.json({ ok: true, delivered, enabled: !!getPublicKey() });
  } catch (e) { next(e); }
});

module.exports = router;
