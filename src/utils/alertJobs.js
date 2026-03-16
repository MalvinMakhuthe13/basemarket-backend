const SavedSearch = require('../models/SavedSearch');
const User = require('../models/User');
const { fetchListingUniverse, evaluateSavedSearch } = require('./savedSearches');
const { sendEmail } = require('./email');
const { createNotification, pushToUser } = require('./notifications');

async function processSavedSearchAlertsForUser(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return { processed: 0, notified: 0 };
  const searches = await SavedSearch.find({ user: userId, isActive: true });
  if (!searches.length) return { processed: 0, notified: 0 };
  const listings = await fetchListingUniverse();
  let processed = 0;
  let notified = 0;
  for (const search of searches) {
    const evaled = evaluateSavedSearch(search.toObject(), listings);
    search.lastMatchedListingIds = evaled.matchIds;
    search.totalMatchCount = evaled.totalCount;
    search.freshMatchCount = evaled.freshCount;
    search.lastCheckedAt = new Date();
    const trulyFresh = evaled.freshIds.filter((id) => !search.lastAlertedListingIds.includes(id));
    if (trulyFresh.length) {
      search.lastAlertedListingIds = [...new Set([...(search.lastAlertedListingIds || []), ...trulyFresh])].slice(-100);
      search.lastAlertedAt = new Date();
      const previewItems = evaled.fresh.filter((x) => trulyFresh.includes(String(x._id || x.id))).slice(0, 3);
      const previewText = previewItems.map((x) => `• ${x.name || x.title} — R${Number(x.price || 0).toLocaleString()}`).join('\n');
      await createNotification({
        userId,
        type: 'saved_search_match',
        title: `${search.name} has ${trulyFresh.length} new match${trulyFresh.length === 1 ? '' : 'es'}`,
        body: previewItems.length ? previewItems.map((x) => x.name || x.title).join(' • ') : 'Fresh listings match your saved search.',
        actionUrl: '/',
        actionLabel: 'View matches',
        icon: 'bell',
        severity: 'info',
        dedupeKey: `saved-search:${search._id}:${trulyFresh.join(',')}`,
        meta: { searchId: String(search._id), listingIds: trulyFresh }
      });
      if (search.emailAlertsEnabled && user.email) {
        await sendEmail({
          to: user.email,
          subject: `BaseMarket alert: ${search.name} has ${trulyFresh.length} new match${trulyFresh.length === 1 ? '' : 'es'}`,
          text: `Your saved search "${search.name}" has ${trulyFresh.length} new matches.\n\n${previewText}`,
          html: `<h2>BaseMarket saved-search alert</h2><p>Your saved search <strong>${search.name}</strong> has <strong>${trulyFresh.length}</strong> new matches.</p><pre>${previewText}</pre>`
        }).catch(()=>null);
      }
      if (search.pushAlertsEnabled) {
        await pushToUser(userId, {
          title: 'BaseMarket alert',
          body: `${search.name}: ${trulyFresh.length} new match${trulyFresh.length === 1 ? '' : 'es'}`,
          url: '/',
          tag: `saved-search-${search._id}`,
        }).catch(()=>null);
      }
      notified += 1;
    }
    await search.save();
    processed += 1;
  }
  return { processed, notified };
}

async function processAllSavedSearchAlerts() {
  const searches = await SavedSearch.find({ isActive: true }).distinct('user');
  let processedUsers = 0;
  let notificationsCreated = 0;
  for (const userId of searches) {
    const result = await processSavedSearchAlertsForUser(userId);
    processedUsers += 1;
    notificationsCreated += result.notified || 0;
  }
  return { processedUsers, notificationsCreated };
}

function startAlertJobs({ everyMs } = {}) {
  const interval = Number(everyMs || process.env.ALERT_JOB_INTERVAL_MS || 10 * 60 * 1000);
  if (!Number.isFinite(interval) || interval < 60 * 1000) return null;
  const runner = async () => {
    try {
      const result = await processAllSavedSearchAlerts();
      console.log('[alert-jobs] processedUsers=%s notifications=%s', result.processedUsers, result.notificationsCreated);
    } catch (err) {
      console.error('[alert-jobs] failed', err?.message || err);
    }
  };
  setTimeout(runner, 15000);
  return setInterval(runner, interval);
}

module.exports = { processSavedSearchAlertsForUser, processAllSavedSearchAlerts, startAlertJobs };
