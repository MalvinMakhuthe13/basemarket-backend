let webpush = null;
try { webpush = require('web-push'); } catch (_) { webpush = null; }

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  if (!webpush) return false;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@basemarket.local';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

function getPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

async function sendPush(subscription, payload) {
  if (!ensureConfigured()) return { ok: false, disabled: true };
  await webpush.sendNotification(subscription, JSON.stringify(payload));
  return { ok: true };
}

module.exports = { getPublicKey, sendPush, ensureConfigured };
