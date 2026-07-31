#!/usr/bin/env node
// One-shot sync — for external cron, systemd timers, or a scheduled
// GitHub Actions workflow (see .github/workflows/sync.yml).
const store = require('../src/store');
const { runSync } = require('../src/sync/runSync');
const { buildDigest, postToSlack } = require('../src/digest');

(async () => {
  try {
    const summary = await runSync();
    const state = store.getState();
    const digest = buildDigest(state, summary);
    console.log(digest);
    await postToSlack(digest);
    process.exit(0);
  } catch (err) {
    console.error('Sync failed:', err);
    process.exit(1);
  }
})();
