const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '').trim();
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ ok: false, message: 'Missing bearer token' });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ ok: false, message: 'Server misconfigured: JWT_SECRET is missing' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  const allowed = new Set((roles || []).map((x) => String(x || '').trim()).filter(Boolean));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Not authenticated' });
    const role = String(req.user.role || '').trim();
    if (!allowed.has(role)) return res.status(403).json({ ok: false, message: 'Forbidden for this role' });
    return next();
  };
}

module.exports = { requireAuth, requireRole };
