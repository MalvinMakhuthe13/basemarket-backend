/**
 * /api/realtime — Server-Sent Events stream
 * Clients connect here to receive live listing and platform events.
 * The server broadcasts events using the global emitter exposed on app.locals.
 */
const express = require('express');
const router  = express.Router();

// In-memory set of active SSE clients
const clients = new Set();

/**
 * Broadcast an event to all connected SSE clients.
 * Call from other routes: req.app.locals.broadcast('listing_created', { ... })
 */
function broadcast(eventType, payload) {
  const data = JSON.stringify({ type: eventType, payload, at: new Date().toISOString() });
  for (const res of clients) {
    try { res.write(`event: ${eventType}\ndata: ${data}\n\n`); }
    catch (_) { clients.delete(res); }
  }
}

// Expose broadcaster so other routes can use it
router.use((req, _res, next) => {
  req.app.locals.broadcast = broadcast;
  next();
});

// GET /api/realtime/stream
router.get('/stream', (req, res) => {
  res.set({
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',   // disable nginx buffering
  });
  res.flushHeaders();

  // Send hello handshake immediately
  res.write('event: hello\ndata: {"ok":true}\n\n');

  // Heartbeat every 25s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); }
    catch (_) { cleanup(); }
  }, 25000);

  clients.add(res);

  function cleanup() {
    clearInterval(heartbeat);
    clients.delete(res);
  }

  req.on('close',   cleanup);
  req.on('aborted', cleanup);
  res.on('close',   cleanup);
});

// GET /api/realtime/status — how many clients are connected
router.get('/status', (_req, res) => {
  res.json({ clients: clients.size, ok: true });
});

module.exports = { router, broadcast };
