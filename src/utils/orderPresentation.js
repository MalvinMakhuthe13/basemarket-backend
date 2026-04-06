const { STATUS } = require("./orderState");

const ORDER_STAGE_LABELS = Object.freeze({
  [STATUS.CREATED]: 'Awaiting payment',
  [STATUS.PAID]: 'Payment secured',
  [STATUS.CONFIRMED]: 'Seller preparing',
  [STATUS.SHIPPED]: 'Shipped / in transit',
  [STATUS.DELIVERED]: 'Delivered / handover done',
  [STATUS.COMPLETED]: 'Completed',
  [STATUS.CANCELLED]: 'Cancelled',
  [STATUS.DISPUTED]: 'Disputed',
  [STATUS.REFUNDED]: 'Refunded',
});

function getOrderStageLabel(order = {}) {
  const status = String(order.status || '').toLowerCase();
  return ORDER_STAGE_LABELS[status] || 'Order update';
}

function getCheckoutLabel(order = {}) {
  return order.secureDeal ? 'Secure Deal' : 'Direct order';
}

function getDeliveryLabel(order = {}) {
  const method = String(order.deliveryMethod || '').toLowerCase();
  if (method === 'shipping') return 'Courier delivery';
  if (method === 'meetup') return 'Meetup';
  if (method === 'digital') return 'Digital fulfilment';
  return 'Delivery';
}

function decorateOrder(order) {
  if (!order || typeof order !== 'object') return order;
  order.stageLabel = getOrderStageLabel(order);
  order.checkoutLabel = getCheckoutLabel(order);
  order.deliveryLabel = getDeliveryLabel(order);
  order.isSecureDeal = !!order.secureDeal;
  order.statusCopy = {
    title: order.stageLabel,
    checkout: order.checkoutLabel,
    delivery: order.deliveryLabel,
    payout: String(order.payoutStatus || 'not_ready').replace(/_/g, ' '),
    payment: String(order.paymentStatus || 'awaiting_payment').replace(/_/g, ' '),
  };
  return order;
}

module.exports = { ORDER_STAGE_LABELS, getOrderStageLabel, getCheckoutLabel, getDeliveryLabel, decorateOrder };
