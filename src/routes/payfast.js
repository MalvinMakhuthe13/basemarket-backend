const express = require("express");
const crypto = require("crypto");
const { requireAuth } = require("../middleware/auth");
const Order = require("../models/Order");
const Conversation = require("../models/Conversation");
const FraudFlag = require('../models/FraudFlag');
const { STATUS, deriveLegacyFields } = require('../utils/orderState');
const { createNotification } = require('../utils/notifications');

const router = express.Router();

function isSandboxLike() {
  const host = String(process.env.PAYFAST_HOST || '').toLowerCase();
  return !host || host.includes('sandbox') || String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
}

async function markOrderPaidFallback(order, source, gatewayRef = '') {
  if (!order) return order;
  order.paymentLockedAt = order.paymentLockedAt || new Date();
  order.payfastItnVerified = !!order.payfastItnVerified;
  order.gateway = 'payfast';
  if (gatewayRef) order.gatewayReference = String(gatewayRef);
  if (order.status === STATUS.CREATED) order.status = STATUS.PAID;
  deriveLegacyFields(order);
  addTimeline(order, 'payment', source || 'Payment secured via fallback confirmation.');
  await order.save();
  await appendOrderConversationMessage(order, 'Payment secured. The seller can now confirm and fulfil the order.');
  await createNotification({ userId: order.seller, type: 'payment_received', title: 'Buyer payment confirmed', body: "The buyer's secure payment was confirmed. You can now confirm and fulfil the order.", actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'wallet', severity: 'success' }).catch(()=>null);
  await createNotification({ userId: order.buyer, type: 'payment_received', title: 'Payment secured', body: 'Your payment is confirmed and the seller can now prepare your order.', actionUrl: '/profile.html', actionLabel: 'Track order', icon: 'shield-check', severity: 'success' }).catch(()=>null);
  return order;
}


function urlEncode(str = "") {
  return encodeURIComponent(String(str).trim()).replace(/%20/g, "+");
}

function buildSignature(data, passphrase = "") {
  const filtered = Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${urlEncode(value)}`);
  if (passphrase) filtered.push(`passphrase=${urlEncode(passphrase)}`);
  return crypto.createHash("md5").update(filtered.join("&")).digest("hex");
}

function addTimeline(order, type, message) {
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  order.timeline.push({ type, message, at: new Date() });
}

async function appendOrderConversationMessage(order, text) {
  try {
    if (!order || !order.listing || !order.buyer || !order.seller || !text) return;
    const listingId = order.listing._id || order.listing;
    const buyerId = order.buyer._id || order.buyer;
    const sellerId = order.seller._id || order.seller;
    let conversation = await Conversation.findOne({ listing: listingId, buyer: buyerId, seller: sellerId, order: order._id });
    if (!conversation) conversation = await Conversation.create({ listing: listingId, buyer: buyerId, seller: sellerId, order: order._id });
    conversation.messages.push({ sender: sellerId, text: String(text).trim() });
    conversation.lastMessage = String(text).trim();
    conversation.lastMessageAt = new Date();
    await conversation.save();
  } catch (_) {}
}

router.post("/create-payment", requireAuth, async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ message: "Missing orderId" });

    const order = await Order.findById(orderId).populate("listing buyer seller");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.buyer?._id || order.buyer) !== String(req.user.id)) return res.status(403).json({ message: "Not allowed" });
    if (!order.secureDeal) return res.status(400).json({ message: "PayFast checkout is only for Secure Deal orders" });
    if (order.paymentStatus !== "awaiting_payment") return res.status(400).json({ message: "Order is not awaiting payment" });

    const amount = Number(order.amount || 0).toFixed(2);
    if (Number(amount) <= 0) return res.status(400).json({ message: "Order amount is invalid" });

    const host = process.env.PAYFAST_HOST || "https://sandbox.payfast.co.za/eng/process";
    const publicBackendBase = String(process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host') || ''}`).replace(/\/$/, '');
    const frontendOrigin = String(process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get('host') || ''}`).replace(/\/$/, '');
    const returnUrl = `${publicBackendBase}/api/payfast/return?orderId=${encodeURIComponent(String(order._id))}`;
    const cancelUrl = `${publicBackendBase}/api/payfast/cancel?orderId=${encodeURIComponent(String(order._id))}`;
    const notifyUrl = process.env.PAYFAST_NOTIFY_URL || `${publicBackendBase}/api/payfast/itn`;
    const data = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      name_first: req.user.name || order.buyer?.name || "Buyer",
      email_address: req.user.email || order.buyer?.email || "",
      m_payment_id: String(order._id),
      amount,
      item_name: order.listing?.title || "BaseMarket Order",
      item_description: `BaseMarket secure deal for order ${order._id}`,
      custom_str1: order.deliveryMethod || "shipping",
      custom_str2: order.secureDeal ? "secure" : "direct",
      custom_str3: frontendOrigin,
    };

    const required = ["merchant_id", "merchant_key", "return_url", "cancel_url", "notify_url"];
    const missing = required.filter((k) => !data[k]);
    if (missing.length) return res.status(500).json({ message: `Missing PayFast configuration: ${missing.join(', ')}` });

    order.gateway = "payfast";
    order.gatewayReference = String(order._id);
    addTimeline(order, "payment", "Buyer started secure payment checkout.");
    await order.save();

    const signature = buildSignature(data, process.env.PAYFAST_PASSPHRASE);
    return res.json({ ok: true, host, fields: { ...data, signature } });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to create payment" });
  }
});

router.get('/itn', (_req, res) => {
  return res.status(200).type('text/plain').send('OK');
});

router.post("/itn", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const body = req.body || {};
    const receivedSignature = body.signature || "";
    const verificationData = { ...body };
    delete verificationData.signature;

    const expectedSignature = buildSignature(verificationData, process.env.PAYFAST_PASSPHRASE);
    if (receivedSignature && receivedSignature !== expectedSignature) {
      await FraudFlag.create({ entityType: 'payment', entityId: String(body.m_payment_id || 'unknown'), reason: 'Invalid PayFast signature received', severity: 'high', metadata: body, createdBy: 'payfast-itn' });
      return res.status(200).type('text/plain').send('OK');
    }

    const orderId = body.m_payment_id;
    const paymentStatus = String(body.payment_status || "").toUpperCase();
    const amountGross = Number(body.amount_gross || body.amount || 0);
    const order = await Order.findById(orderId);
    if (!order) return res.status(200).type('text/plain').send('OK');

    order.lastPayfastPayload = body;
    const orderAmount = Number(order.amount || 0);
    if (Number(amountGross.toFixed(2)) !== Number(orderAmount.toFixed(2))) {
      await FraudFlag.create({ entityType: 'payment', entityId: String(order._id), reason: 'PayFast amount mismatch', severity: 'high', metadata: { amountGross, orderAmount, body }, createdBy: 'payfast-itn' });
      return res.status(200).type('text/plain').send('OK');
    }

    if (paymentStatus === "COMPLETE") {
      if (order.paymentLockedAt) return res.status(200).send('OK');
      order.payfastItnVerified = true;
      await markOrderPaidFallback(order, 'Payment secured via PayFast ITN. Funds are locked until order completion.', body.pf_payment_id || body.m_payment_id || order._id);
    } else if (["FAILED", "CANCELLED"].includes(paymentStatus)) {
      order.paymentStatus = paymentStatus === "FAILED" ? "failed" : "cancelled";
      if (order.status === STATUS.CREATED) order.status = STATUS.CANCELLED;
      deriveLegacyFields(order);
      addTimeline(order, "payment", `Payment ${paymentStatus.toLowerCase()} on PayFast.`);
      await order.save();
      await createNotification({ userId: order.buyer, type: 'payment_update', title: 'Payment was not completed', body: `Your PayFast payment was ${paymentStatus.toLowerCase()}.`, actionUrl: '/profile.html', actionLabel: 'View order', icon: 'alert-circle', severity: 'warning' }).catch(()=>null);
    }

    return res.status(200).type('text/plain').send('OK');
  } catch (_err) {
    return res.status(200).type('text/plain').send('OK');
  }
});



function resolveFrontendOrigin(req, order, body = {}) {
  const fromCustom = String(body.custom_str3 || order?.lastPayfastPayload?.custom_str3 || '').trim();
  const configured = String(process.env.FRONTEND_ORIGIN || '').trim();
  const fallback = `${req.protocol}://${req.get('host') || ''}`;
  return (fromCustom || configured || fallback).replace(/\/$/, '');
}

function buildFrontendOrderUrl(req, order, status = 'complete', extra = {}) {
  const base = resolveFrontendOrigin(req, order, extra);
  const params = new URLSearchParams({
    orderId: String(order?._id || extra.orderId || ''),
    payfast: status,
  });
  if (extra.payment_status) params.set('payment_status', String(extra.payment_status));
  if (extra.pf_payment_id) params.set('pf_payment_id', String(extra.pf_payment_id));
  if (extra.m_payment_id) params.set('m_payment_id', String(extra.m_payment_id));
  params.set('tab', 'orders');
  return `${base}/profile.html?${params.toString()}#orders`;
}

router.get('/return', async (req, res) => {
  try {
    const query = req.query || {};
    const orderId = query.orderId || query.m_payment_id;
    const genericRedirect = `${String(process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get('host') || ''}`).replace(/\/$/, '')}/profile.html?tab=orders#orders`;
    if (!orderId) return res.redirect(genericRedirect);
    const order = await Order.findById(orderId);
    if (!order) return res.redirect(genericRedirect);

    order.lastPayfastPayload = { ...(order.lastPayfastPayload || {}), ...query, returnSeenAt: new Date().toISOString() };
    const paymentStatus = String(query.payment_status || '').toUpperCase();
    if (paymentStatus === 'COMPLETE' && order.paymentStatus !== 'paid') {
      await markOrderPaidFallback(order, 'Payment secured from PayFast return redirect. Funds stay locked until order completion.', query.pf_payment_id || query.m_payment_id || orderId);
    } else {
      await order.save();
    }
    return res.redirect(buildFrontendOrderUrl(req, order, paymentStatus === 'COMPLETE' ? 'complete' : 'return', query));
  } catch (_err) {
    return res.redirect(`${String(process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get('host') || ''}`).replace(/\/$/, '')}/profile.html?tab=orders#orders`);
  }
});

router.get('/cancel', async (req, res) => {
  try {
    const query = req.query || {};
    const orderId = query.orderId || query.m_payment_id;
    const genericRedirect = `${String(process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get('host') || ''}`).replace(/\/$/, '')}/profile.html?tab=orders&payfast=cancel#orders`;
    if (!orderId) return res.redirect(genericRedirect);
    const order = await Order.findById(orderId);
    if (order) {
      order.lastPayfastPayload = { ...(order.lastPayfastPayload || {}), ...query, cancelSeenAt: new Date().toISOString() };
      addTimeline(order, 'payment', 'Buyer returned from PayFast without completing the payment.');
      await order.save();
      return res.redirect(buildFrontendOrderUrl(req, order, 'cancel', query));
    }
    return res.redirect(genericRedirect);
  } catch (_err) {
    return res.redirect(`${String(process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get('host') || ''}`).replace(/\/$/, '')}/profile.html?tab=orders&payfast=cancel#orders`);
  }
});

router.post('/return-sync', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const orderId = body.orderId || body.m_payment_id;
    const paymentStatus = String(body.payment_status || '').toUpperCase();
    if (!orderId) return res.status(400).json({ message: 'Missing orderId' });
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.buyer) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
    if (!order.secureDeal) return res.status(400).json({ message: 'This order is not a secure payment order' });
    if (order.paymentStatus === 'paid') return res.json({ ok: true, alreadyPaid: true, order });
    if (paymentStatus !== 'COMPLETE') return res.status(400).json({ message: 'Payment is not marked complete' });
    await markOrderPaidFallback(order, 'Payment secured from buyer return confirmation. Funds stay locked until completion.', body.pf_payment_id || body.payment_id || orderId);
    return res.json({ ok: true, order });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Could not sync payment return' });
  }
});

module.exports = router;
