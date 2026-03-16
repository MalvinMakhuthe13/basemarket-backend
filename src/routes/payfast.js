const express = require("express");
const crypto = require("crypto");
const { requireAuth } = require("../middleware/auth");
const Order = require("../models/Order");
const Conversation = require("../models/Conversation");
const FraudFlag = require('../models/FraudFlag');
const { STATUS, deriveLegacyFields } = require('../utils/orderState');
const { createNotification } = require('../utils/notifications');

const router = express.Router();

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
    const data = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,
      return_url: process.env.PAYFAST_RETURN_URL,
      cancel_url: process.env.PAYFAST_CANCEL_URL,
      notify_url: process.env.PAYFAST_NOTIFY_URL,
      name_first: req.user.name || order.buyer?.name || "Buyer",
      email_address: req.user.email || order.buyer?.email || "",
      m_payment_id: String(order._id),
      amount,
      item_name: order.listing?.title || "BaseMarket Order",
      item_description: `BaseMarket secure deal for order ${order._id}`,
      custom_str1: order.deliveryMethod || "shipping",
      custom_str2: order.secureDeal ? "secure" : "direct",
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

router.post("/itn", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const body = req.body || {};
    const receivedSignature = body.signature || "";
    const verificationData = { ...body };
    delete verificationData.signature;

    const expectedSignature = buildSignature(verificationData, process.env.PAYFAST_PASSPHRASE);
    if (receivedSignature && receivedSignature !== expectedSignature) {
      await FraudFlag.create({ entityType: 'payment', entityId: String(body.m_payment_id || 'unknown'), reason: 'Invalid PayFast signature received', severity: 'high', metadata: body, createdBy: 'payfast-itn' });
      return res.status(400).send("Invalid signature");
    }

    const orderId = body.m_payment_id;
    const paymentStatus = String(body.payment_status || "").toUpperCase();
    const amountGross = Number(body.amount_gross || body.amount || 0);
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send("Order not found");

    order.lastPayfastPayload = body;
    const orderAmount = Number(order.amount || 0);
    if (Number(amountGross.toFixed(2)) !== Number(orderAmount.toFixed(2))) {
      await FraudFlag.create({ entityType: 'payment', entityId: String(order._id), reason: 'PayFast amount mismatch', severity: 'high', metadata: { amountGross, orderAmount, body }, createdBy: 'payfast-itn' });
      return res.status(400).send("Amount mismatch");
    }

    if (paymentStatus === "COMPLETE") {
      if (order.paymentLockedAt) return res.status(200).send('OK');
      order.paymentLockedAt = new Date();
      order.payfastItnVerified = true;
      order.gateway = "payfast";
      order.gatewayReference = String(body.pf_payment_id || body.m_payment_id || order._id);
      if (order.status === STATUS.CREATED) order.status = STATUS.PAID;
      deriveLegacyFields(order);
      addTimeline(order, "payment", "Payment secured via PayFast ITN. Funds are locked until order completion.");
      await order.save();
      await appendOrderConversationMessage(order, 'Payment secured. The seller can now confirm and fulfil the order.');
      await createNotification({ userId: order.seller, type: 'payment_received', title: 'Buyer payment confirmed', body: "The buyer's secure payment was confirmed. You can now confirm and fulfil the order.", actionUrl: '/profile.html', actionLabel: 'View sold orders', icon: 'wallet', severity: 'success' }).catch(()=>null);
      await createNotification({ userId: order.buyer, type: 'payment_received', title: 'Payment secured', body: 'Your payment is confirmed and the seller can now prepare your order.', actionUrl: '/profile.html', actionLabel: 'Track order', icon: 'shield-check', severity: 'success' }).catch(()=>null);
    } else if (["FAILED", "CANCELLED"].includes(paymentStatus)) {
      order.paymentStatus = paymentStatus === "FAILED" ? "failed" : "cancelled";
      if (order.status === STATUS.CREATED) order.status = STATUS.CANCELLED;
      deriveLegacyFields(order);
      addTimeline(order, "payment", `Payment ${paymentStatus.toLowerCase()} on PayFast.`);
      await order.save();
      await createNotification({ userId: order.buyer, type: 'payment_update', title: 'Payment was not completed', body: `Your PayFast payment was ${paymentStatus.toLowerCase()}.`, actionUrl: '/profile.html', actionLabel: 'View order', icon: 'alert-circle', severity: 'warning' }).catch(()=>null);
    }

    return res.status(200).send("OK");
  } catch (_err) {
    return res.status(500).send("ITN error");
  }
});

module.exports = router;
