const { randomUUID } = require('crypto');
const store = require('../store');
const config = require('../config');
const { fetchCapsuleLeads } = require('./capsule');
const { fetchCalendarLeads } = require('./calendar');
const { mergeLeads } = require('./merge');

async function runSync() {
  await store.load();
  const state = store.getState();
  const runAt = new Date().toISOString();

  const [capsuleLeads, calendarLeads] = await Promise.all([
    fetchCapsuleLeads(config.capsule.token).catch((err) => {
      console.error('[sync] Capsule sync failed:', err.message);
      return [];
    }),
    fetchCalendarLeads(config.calendar, {
      companyDomain: config.companyDomain,
      since: state.meta.lastCalendarSyncAt,
      ignoredEventIds: state.ignoredMeetings,
    }).catch((err) => {
      console.error('[sync] Calendar sync failed:', err.message);
      return [];
    }),
  ]);

  const mergeSummary = mergeLeads(state.leads, [...capsuleLeads, ...calendarLeads], {
    followUpDays: state.settings.followUpDays || config.followUpDays,
    uuid: randomUUID,
  });

  state.meta.lastCapsuleSyncAt = runAt;
  state.meta.lastCalendarSyncAt = runAt;
  state.meta.lastRunAt = runAt;
  state.meta.lastRunSummary = {
    ...mergeSummary,
    capsuleFound: capsuleLeads.length,
    calendarFound: calendarLeads.length,
  };

  await store.save();
  return state.meta.lastRunSummary;
}

module.exports = { runSync };
