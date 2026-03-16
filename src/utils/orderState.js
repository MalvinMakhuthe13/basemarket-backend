const STATUS = Object.freeze({
  CREATED: 'created',
  PAID: 'paid',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
  REFUNDED: 'refunded',
});

const TRANSITIONS = Object.freeze({
  [STATUS.CREATED]: [STATUS.PAID, STATUS.CONFIRMED, STATUS.CANCELLED, STATUS.DISPUTED],
  [STATUS.PAID]: [STATUS.CONFIRMED, STATUS.CANCELLED, STATUS.REFUNDED, STATUS.DISPUTED],
  [STATUS.CONFIRMED]: [STATUS.SHIPPED, STATUS.DELIVERED, STATUS.CANCELLED, STATUS.DISPUTED],
  [STATUS.SHIPPED]: [STATUS.DELIVERED, STATUS.DISPUTED],
  [STATUS.DELIVERED]: [STATUS.COMPLETED, STATUS.DISPUTED],
  [STATUS.COMPLETED]: [],
  [STATUS.CANCELLED]: [],
  [STATUS.DISPUTED]: [STATUS.REFUNDED, STATUS.COMPLETED],
  [STATUS.REFUNDED]: [],
});

function canTransition(current, next) {
  return !!(TRANSITIONS[current] || []).includes(next);
}

function assertTransition(current, next) {
  if (!canTransition(current, next)) {
    const err = new Error(`Invalid order transition: ${current} -> ${next}`);
    err.statusCode = 400;
    throw err;
  }
}

function deriveLegacyFields(order) {
  const status = order.status || STATUS.CREATED;
  switch (status) {
    case STATUS.CREATED:
      order.paymentStatus = order.secureDeal ? 'awaiting_payment' : 'not_applicable';
      order.escrowStatus = order.secureDeal ? 'holding_pending_payment' : 'open';
      break;
    case STATUS.PAID:
      order.paymentStatus = 'paid';
      order.escrowStatus = 'holding';
      break;
    case STATUS.CONFIRMED:
      order.paymentStatus = order.secureDeal ? 'paid' : order.paymentStatus;
      order.escrowStatus = order.deliveryMethod === 'meetup' ? 'meetup_ready' : 'awaiting_fulfilment';
      break;
    case STATUS.SHIPPED:
      order.paymentStatus = order.secureDeal ? 'paid' : order.paymentStatus;
      order.escrowStatus = order.deliveryMethod === 'meetup' ? 'meetup_ready' : 'shipped';
      break;
    case STATUS.DELIVERED:
      order.paymentStatus = order.secureDeal ? 'paid' : order.paymentStatus;
      order.escrowStatus = 'delivered';
      order.payoutStatus = 'ready';
      break;
    case STATUS.COMPLETED:
      order.paymentStatus = order.secureDeal ? 'paid' : order.paymentStatus;
      order.escrowStatus = 'released';
      order.payoutStatus = order.payoutStatus === 'paid' ? 'paid' : 'ready';
      break;
    case STATUS.CANCELLED:
      order.paymentStatus = order.paymentStatus === 'paid' ? 'refunded' : 'cancelled';
      order.escrowStatus = 'open';
      break;
    case STATUS.DISPUTED:
      order.escrowStatus = 'disputed';
      break;
    case STATUS.REFUNDED:
      order.paymentStatus = 'refunded';
      order.escrowStatus = 'open';
      order.payoutStatus = 'not_ready';
      break;
  }
  return order;
}



function normalizeOrderState(order) {
  if (!order) return order;
  const secureDeal = !!order.secureDeal;
  const status = String(order.status || '').toLowerCase() || STATUS.CREATED;
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  const escrowStatus = String(order.escrowStatus || '').toLowerCase();
  const deliveryMethod = String(order.deliveryMethod || 'shipping').toLowerCase();
  const hasPreparing = !!(order.sellerPreparingAt || order.preparingStartedAt || order.preparingAt);
  const hasShipped = !!(order.sellerMarkedShippedAt || order.trackingNumber) || ['shipped','meetup_ready'].includes(escrowStatus);
  const hasDelivered = !!(order.buyerConfirmedAt || order.deliveredAt) || ['delivered','released'].includes(escrowStatus);
  const payoutPaid = String(order.payoutStatus || '').toLowerCase() === 'paid';

  if (secureDeal && paymentStatus === 'paid' && (status === STATUS.CREATED || !status)) {
    order.status = STATUS.PAID;
  }
  if ((hasPreparing || ['awaiting_fulfilment'].includes(escrowStatus)) && [STATUS.CREATED, STATUS.PAID].includes(String(order.status || '').toLowerCase())) {
    order.status = STATUS.CONFIRMED;
  }
  if (deliveryMethod === 'meetup') {
    if (hasShipped && [STATUS.CREATED, STATUS.PAID, STATUS.CONFIRMED].includes(String(order.status || '').toLowerCase())) {
      order.status = STATUS.DELIVERED;
    }
  } else {
    if (hasShipped && [STATUS.CREATED, STATUS.PAID, STATUS.CONFIRMED].includes(String(order.status || '').toLowerCase())) {
      order.status = STATUS.SHIPPED;
    }
    if (hasDelivered && [STATUS.CREATED, STATUS.PAID, STATUS.CONFIRMED, STATUS.SHIPPED].includes(String(order.status || '').toLowerCase())) {
      order.status = STATUS.DELIVERED;
    }
  }
  if ((hasDelivered || escrowStatus === 'released' || payoutPaid) && ![STATUS.CANCELLED, STATUS.REFUNDED, STATUS.DISPUTED].includes(String(order.status || '').toLowerCase())) {
    if (String(order.status || '').toLowerCase() === STATUS.DELIVERED && !!order.buyerConfirmedAt) {
      order.status = STATUS.COMPLETED;
    }
    if (escrowStatus === 'released' || payoutPaid) {
      order.status = STATUS.COMPLETED;
    }
  }
  deriveLegacyFields(order);
  return order;
}

module.exports = { STATUS, TRANSITIONS, canTransition, assertTransition, deriveLegacyFields, normalizeOrderState };
