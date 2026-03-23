const express = require("express");
const { nanoid } = require("nanoid");
const { requireAuth } = require("../middleware/auth");
const User = require("../models/User");
const ManualCode = require("../models/ManualCode");
const EmailVerifyToken = require("../models/EmailVerifyToken");

const router = express.Router();

function buildVerifySummary(user = {}) {
  const accountVerified = !!(user.verified || user.emailVerified || user.phone?.verified);
  const sellerStatus = String(user.seller?.status || 'none');
  const sellerSubmitted = sellerStatus === 'pending' || sellerStatus === 'approved' || sellerStatus === 'rejected';
  const nextSteps = [];
  if (!accountVerified) nextSteps.push('Verify your account with the one-time code from WhatsApp.');
  if (!sellerSubmitted) nextSteps.push('Submit seller verification to unlock stronger trust cues.');
  if (sellerStatus === 'pending') nextSteps.push('Seller verification is pending admin review.');
  if (sellerStatus === 'rejected' && user.seller?.decisionReason) nextSteps.push(`Seller review note: ${user.seller.decisionReason}`);
  return {
    accountVerified,
    sellerStatus,
    accountLevel: accountVerified ? 'verified' : 'unverified',
    sellerSubmitted,
    requestedAt: user.seller?.requestedAt || null,
    decidedAt: user.seller?.decidedAt || null,
    seller: {
      fullName: user.seller?.fullName || '',
      area: user.seller?.area || '',
      selfieProvided: !!user.seller?.selfieProvided,
      proofProvided: !!user.seller?.proofProvided,
      decisionReason: user.seller?.decisionReason || '',
      reviewNotes: user.seller?.reviewNotes || '',
    },
    nextSteps,
  };
}

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ ok: true, verification: buildVerifySummary(user), user });
  } catch (e) { next(e); }
});

// Email verification (simple: generate token; you can email the link yourself)
router.post('/email/start', requireAuth, async (req, res, next) => {
  try {
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h
    await EmailVerifyToken.create({ user: req.user.id, token, expiresAt });

    const frontend = process.env.FRONTEND_ORIGIN || '';
    const base = frontend.endsWith('/') ? frontend.slice(0, -1) : frontend;
    const link = frontend ? `${base}/?email_verify=${token}` : token;

    res.json({ token, link, message: 'Email verification started' });
  } catch (e) { next(e); }
});

router.get('/email/confirm', async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) return res.status(400).json({ message: 'Missing token' });

    const rec = await EmailVerifyToken.findOne({ token });
    if (!rec) return res.status(400).json({ message: 'Invalid token' });
    if (rec.usedAt) return res.status(400).json({ message: 'Token already used' });
    if (rec.expiresAt.getTime() < Date.now()) return res.status(400).json({ message: 'Token expired' });

    await User.findByIdAndUpdate(rec.user, { emailVerified: true });
    rec.usedAt = new Date();
    await rec.save();

    res.json({ message: 'Email verified' });
  } catch (e) { next(e); }
});

router.post('/seller/submit', requireAuth, async (req, res, next) => {
  try {
    const fullName = String(req.body?.fullName || req.body?.fullname || '').trim();
    const area = String(req.body?.area || '').trim();
    const selfieProvided = !!req.body?.selfieProvided;
    const proofProvided = !!req.body?.proofProvided;

    if (!fullName || !area) {
      return res.status(400).json({ message: 'Full name and area are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.seller = user.seller || {};
    user.seller.status = 'pending';
    user.seller.requestedAt = new Date();
    user.seller.decidedAt = null;
    user.seller.decisionReason = '';
    user.seller.fullName = fullName;
    user.seller.area = area;
    user.seller.selfieProvided = selfieProvided;
    user.seller.proofProvided = proofProvided;
    await user.save();

    res.json({ ok: true, message: 'Seller verification submitted', verification: buildVerifySummary(user), user });
  } catch (e) { next(e); }
});

// Manual trust verification (WhatsApp + code required)
router.post('/manual/redeem', requireAuth, async (req, res, next) => {
  try {
    const code = String((req.body || {}).code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ message: 'Missing code' });

    const rec = await ManualCode.findOne({ code });
    if (!rec) return res.status(400).json({ message: 'Invalid code' });
    if (rec.usedAt) return res.status(400).json({ message: 'Code already used' });
    if (rec.expiresAt.getTime() < Date.now()) return res.status(400).json({ message: 'Code expired' });

    await User.findByIdAndUpdate(req.user.id, {
      verified: true,
      verifiedAt: new Date(),
      verifiedNote: 'Verified via WhatsApp + code'
    });

    rec.usedAt = new Date();
    rec.usedBy = req.user.id;
    await rec.save();

    const user = await User.findById(req.user.id).lean();
    res.json({ message: 'Verified', verified: true, verification: buildVerifySummary(user), user: { id: user._id, email: user.email, verified: user.verified, seller: user.seller } });
  } catch (e) { next(e); }
});

module.exports = router;
