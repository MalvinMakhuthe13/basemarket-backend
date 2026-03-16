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

module.exports = { STATUS, TRANSITIONS, canTransition, assertTransition, deriveLegacyFields };
