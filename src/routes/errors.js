const express = require('express');
const router = express.Router();

// POST /api/errors — client-side error logging
router.post('/', (req, res) => {
  const { message, stack, url, userAgent, timestamp } = req.body || {};
  if (message) {
    console.error('[client-error]', {
      message: String(message || '').slice(0, 500),
      url: String(url || '').slice(0, 200),
      userAgent: String(userAgent || '').slice(0, 200),
      stack: String(stack || '').slice(0, 1000),
      timestamp: timestamp || new Date().toISOString(),
    });
  }
  res.json({ ok: true });
});

module.exports = router;
