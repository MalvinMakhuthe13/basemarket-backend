const express = require('express');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const { buildTrustProfilesForUsers } = require('../utils/trust');

const router = express.Router();

// GET /api/users/:id/trust — seller trust badge in checkout
router.get('/:id/trust', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    const trustProfiles = await buildTrustProfilesForUsers([user]);
    const trust = (trustProfiles && trustProfiles[String(user._id)]) || null;
    res.json({ ok: true, trust, user: { id: user._id, name: user.name, verified: user.verified, emailVerified: user.emailVerified } });
  } catch (e) { next(e); }
});

module.exports = router;
