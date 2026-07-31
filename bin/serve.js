#!/usr/bin/env node
const store = require('../src/store');
const config = require('../src/config');

(async () => {
  await store.load();

  const app = require('../src/server');
  app.listen(config.port, () => {
    console.log(`Follow-up ledger listening on http://localhost:${config.port}`);
  });

  if (config.schedulerEnabled) {
    require('../src/scheduler').start();
  } else {
    console.log('[serve] scheduler disabled (DISABLE_SCHEDULER=true) — sync only runs via "Sync now" or the API.');
  }
})();
