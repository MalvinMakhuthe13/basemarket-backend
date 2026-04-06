function requireAdminKey(req, res, next) {
  const key = req.headers["x-admin-key"];
  const expected = process.env.ADMIN_KEY;
  if (!expected) return res.status(500).json({ message: "ADMIN_KEY not configured" });
  if (!key || key !== expected) return res.status(403).json({ message: "Forbidden" });
  return next();
}

module.exports = { requireAdminKey };
