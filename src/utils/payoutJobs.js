const Order = require('../models/Order');
const Dispute = require('../models/Dispute');
const { STATUS, deriveLegacyFields } = require('./orderState');
const { createNotification } = require('./notifications');

async function processPayoutReadiness() {
  const releaseHours = Number(process.env.DEFAULT_ESCROW_RELEASE_HOURS || 72);
  const cutoff = new Date(Date.now() - (Math.max(1, releaseHours) * 60 * 60 * 1000));
  const orders = await Order.find({
    secureDeal: true,
    status: STATUS.DELIVERED,
    payoutStatus: { $in: ['not_ready', 'ready'] },
    disputedAt: null,
    buyerConfirmedAt: null,
    updatedAt: { $lte: cutoff },
  }).limit(200);

  let markedReady = 0;
  for (const order of orders) {
    const activeDispute = await Dispute.findOne({ order: order._id, status: { $in: ['open', 'under_review'] } }).lean();
    if (activeDispute) continue;
    order.payoutStatus = 'ready';
    order.payoutReadyAt = order.payoutReadyAt || new Date();
    order.releasedAt = order.releasedAt || new Date();
    order.status = STATUS.COMPLETED;
    deriveLegacyFields(order);
    order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
    order.timeline.push({ type: 'payout', message: `Auto-release window reached after ${releaseHours} hours with no dispute. Payout is now ready.`, at: new Date() });
    await order.save();
    await createNotification({
      userId: order.seller,
      type: 'payout_update',
      title: 'Payout is ready',
      body: `Order ${order._id} reached its auto-release window with no dispute.`,
      actionUrl: '/profile.html',
      actionLabel: 'View payout',
      icon: 'wallet',
      severity: 'success',
      dedupeKey: `payout-ready:${order._id}`,
    }).catch(()=>null);
    markedReady += 1;
  }
  return { markedReady };
}

function startPayoutJobs({ everyMs } = {}) {
  const interval = Number(everyMs || process.env.ALERT_JOB_INTERVAL_MS || 10 * 60 * 1000);
  if (!Number.isFinite(interval) || interval < 60 * 1000) return null;
  const runner = async () => {
    try {
      const result = await processPayoutReadiness();
      console.log('[payout-jobs] markedReady=%s', result.markedReady);
    } catch (err) {
      console.error('[payout-jobs] failed', err?.message || err);
    }
  };
  setTimeout(runner, 20000);
  return setInterval(runner, interval);
}

module.exports = { processPayoutReadiness, startPayoutJobs };
