const cron = require('node-cron');
const config = require('./config');
const { runSync } = require('./sync/runSync');

function start() {
  if (!cron.validate(config.syncCron)) {
    throw new Error(`Invalid SYNC_CRON expression: "${config.syncCron}"`);
  }
  console.log(`[scheduler] sync scheduled with cron "${config.syncCron}"`);
  cron.schedule(config.syncCron, async () => {
    console.log(`[scheduler] running sync at ${new Date().toISOString()}`);
    try {
      const summary = await runSync();
      console.log('[scheduler] sync complete:', summary);
    } catch (err) {
      console.error('[scheduler] sync failed:', err);
    }
  });
}

module.exports = { start };
