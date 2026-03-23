const Order = require('../models/Order');
const Listing = require('../models/Listing');
const Conversation = require('../models/Conversation');

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function averageResponseMinutesForUser(userId, conversations = []) {
  const mine = String(userId || '');
  const diffs = [];
  for (const conv of conversations || []) {
    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    for (let i = 0; i < messages.length - 1; i += 1) {
      const a = messages[i];
      const b = messages[i + 1];
      const aSender = String((a && a.sender && (a.sender._id || a.sender.id)) || a.sender || '');
      const bSender = String((b && b.sender && (b.sender._id || b.sender.id)) || b.sender || '');
      if (!aSender || !bSender || aSender === bSender || bSender !== mine) continue;
      const aAt = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bAt = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const diffMin = (bAt - aAt) / 60000;
      if (Number.isFinite(diffMin) && diffMin >= 0.1 && diffMin <= 60 * 24 * 7) diffs.push(diffMin);
    }
  }
  if (!diffs.length) return null;
  return Math.round(diffs.reduce((s, n) => s + n, 0) / diffs.length);
}

function buildTrustProfile(user = {}, metrics = {}) {
  const completedDeals = Number(metrics.completedDeals || 0);
  const successfulSales = Number(metrics.successfulSales || 0);
  const activeListings = Number(metrics.activeListings || 0);
  const avgResponseMinutes = Number.isFinite(Number(metrics.avgResponseMinutes)) ? Number(metrics.avgResponseMinutes) : null;
  const verified = !!(user.verified || user.emailVerified || user.phone?.verified || user.seller?.status === 'approved');
  const sellerApproved = String(user.seller?.status || '') === 'approved';
  const phoneVerified = !!user.phone?.verified;
  const emailVerified = !!user.emailVerified;
  let score = 35;
  if (verified) score += 18;
  if (sellerApproved) score += 12;
  if (phoneVerified) score += 5;
  if (emailVerified) score += 5;
  score += Math.min(30, completedDeals * 4);
  score += Math.min(8, successfulSales * 2);
  if (avgResponseMinutes != null) {
    if (avgResponseMinutes <= 5) score += 15;
    else if (avgResponseMinutes <= 15) score += 11;
    else if (avgResponseMinutes <= 60) score += 7;
    else if (avgResponseMinutes <= 180) score += 4;
  }
  if (activeListings >= 3) score += 2;
  score = clamp(Math.round(score), 25, 98);
  let level = 'growing';
  if (score >= 85) level = 'elite';
  else if (score >= 70) level = 'trusted';
  else if (score >= 55) level = 'good';
  return {
    score,
    level,
    verified,
    sellerApproved,
    completedDeals,
    successfulSales,
    activeListings,
    avgResponseMinutes,
    responseLabel: avgResponseMinutes == null ? 'New responder' : avgResponseMinutes <= 5 ? 'Responds fast' : avgResponseMinutes <= 30 ? 'Responds well' : 'Response time varies'
  };
}

async function buildTrustProfilesForUsers(users = []) {
  const idList = [...new Set((users || []).map((u) => String(u && (u._id || u.id || u))).filter(Boolean))];
  if (!idList.length) return {};

  const [completedOrders, activeListingAgg, convs] = await Promise.all([
    Order.find({ status: 'completed', $or: [{ seller: { $in: idList } }, { buyer: { $in: idList } }] }, 'seller buyer').lean().catch(() => []),
    Listing.aggregate([
      { $match: { owner: { $in: idList }, status: { $in: ['active', 'ended', 'sold'] } } },
      { $project: { owner: { $toString: '$owner' } } },
      { $group: { _id: '$owner', activeListings: { $sum: 1 } } }
    ]).catch(() => []),
    Conversation.find({ $or: [{ seller: { $in: idList } }, { buyer: { $in: idList } }] }, 'buyer seller messages').sort({ updatedAt: -1 }).limit(300).lean().catch(() => [])
  ]);

  const byUser = {};
  for (const id of idList) byUser[id] = { completedDeals: 0, successfulSales: 0, activeListings: 0, conversations: [] };
  for (const row of completedOrders || []) {
    const seller = String(row.seller || '');
    const buyer = String(row.buyer || '');
    if (byUser[seller]) {
      byUser[seller].completedDeals += 1;
      byUser[seller].successfulSales += 1;
    }
    if (byUser[buyer]) byUser[buyer].completedDeals += 1;
  }
  for (const row of activeListingAgg || []) {
    const id = String(row._id || '');
    if (byUser[id]) byUser[id].activeListings = Number(row.activeListings || 0);
  }
  for (const conv of convs || []) {
    const seller = String(conv.seller || '');
    const buyer = String(conv.buyer || '');
    if (byUser[seller]) byUser[seller].conversations.push(conv);
    if (byUser[buyer]) byUser[buyer].conversations.push(conv);
  }

  const out = {};
  for (const user of users || []) {
    const id = String(user && (user._id || user.id || user));
    if (!id) continue;
    const metrics = byUser[id] || {};
    out[id] = buildTrustProfile(user, {
      completedDeals: metrics.completedDeals || 0,
      successfulSales: metrics.successfulSales || 0,
      activeListings: metrics.activeListings || 0,
      avgResponseMinutes: averageResponseMinutesForUser(id, metrics.conversations || [])
    });
  }
  return out;
}

module.exports = { buildTrustProfile, buildTrustProfilesForUsers };
