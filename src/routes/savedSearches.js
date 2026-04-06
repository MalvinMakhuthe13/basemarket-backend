const express = require('express');
const SavedSearch = require('../models/SavedSearch');
const { requireAuth } = require('../middleware/auth');
const { fetchListingUniverse, evaluateSavedSearch } = require('../utils/savedSearches');
const { processSavedSearchAlertsForUser } = require('../utils/alertJobs');

const router = express.Router();

function normalizePayload(body={}) {
  return {
    name: String(body.name || body.label || '').trim() || 'Saved search',
    query: String(body.query || '').trim(),
    filters: body.filters && typeof body.filters === 'object' ? body.filters : {},
    emailAlertsEnabled: body.emailAlertsEnabled !== false,
    pushAlertsEnabled: !!body.pushAlertsEnabled,
    homepageEnabled: body.homepageEnabled !== false,
    isActive: body.isActive !== false,
  };
}

async function decorateSearches(userId) {
  const searches = await SavedSearch.find({ user: userId }).sort({ createdAt: -1 }).lean();
  const listings = await fetchListingUniverse();
  return searches.map((row)=> {
    const evaled = evaluateSavedSearch(row, listings);
    return { ...row, matchIds: evaled.matchIds, freshIds: evaled.freshIds, totalCount: evaled.totalCount, freshCount: evaled.freshCount };
  });
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await decorateSearches(req.user.id);
    res.json({ ok: true, items });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const payload = normalizePayload(req.body || {});
    const created = await SavedSearch.create({ user: req.user.id, ...payload });
    res.status(201).json({ ok: true, item: created });
  } catch (e) { next(e); }
});

router.post('/sync-local', requireAuth, async (req, res, next) => {
  try {
    const alerts = Array.isArray(req.body?.alerts) ? req.body.alerts : [];
    const existing = await SavedSearch.find({ user: req.user.id }).lean();
    const existingBySignature = new Map(existing.map((x)=> [`${x.name}::${x.query}::${JSON.stringify(x.filters||{})}`, x]));
    const created = [];
    for (const raw of alerts.slice(0, 25)) {
      const payload = normalizePayload(raw);
      const sig = `${payload.name}::${payload.query}::${JSON.stringify(payload.filters||{})}`;
      if (existingBySignature.has(sig)) continue;
      const item = await SavedSearch.create({ user: req.user.id, ...payload });
      created.push(item);
      existingBySignature.set(sig, item);
    }
    const items = await decorateSearches(req.user.id);
    res.json({ ok: true, createdCount: created.length, items });
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const payload = normalizePayload(req.body || {});
    const item = await SavedSearch.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, payload, { new: true });
    if (!item) return res.status(404).json({ message: 'Saved search not found' });
    res.json({ ok: true, item });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const item = await SavedSearch.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!item) return res.status(404).json({ message: 'Saved search not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/check-updates', requireAuth, async (req, res, next) => {
  try {
    await processSavedSearchAlertsForUser(req.user.id);
    const items = await decorateSearches(req.user.id);
    res.json({ ok: true, items: items.map((x)=> ({ id: String(x._id), name: x.name, freshCount: x.freshCount, totalCount: x.totalCount, freshIds: x.freshIds })) });
  } catch (e) { next(e); }
});

module.exports = router;
