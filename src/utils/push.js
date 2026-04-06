let webpush = null;
let configured = false;

function getWebPush() {
  if (webpush) return webpush;
  try {
    // Optional dependency: if missing, push simply stays disabled.
    // This prevents deploy/install failures from breaking the whole API.
    // eslint-disable-next-line global-require
    webpush = require('web-push');
  } catch (_err) {
    webpush = null;
  }
  return webpush;
}

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@basemarket.local';
  const wp = getWebPush();
  if (!wp || !publicKey || !privateKey) return false;
  wp.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

function getPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

async function sendPush(subscription, payload) {
  const wp = getWebPush();
  if (!wp || !ensureConfigured()) return { ok: false, disabled: true };
  await wp.sendNotification(subscription, JSON.stringify(payload));
  return { ok: true };
}

module.exports = { getPublicKey, sendPush, ensureConfigured };
