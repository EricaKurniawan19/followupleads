#!/usr/bin/env node
// Standalone scheduler with no web server — for an always-on local machine
// that should just keep syncing in the background.
const store = require('../src/store');
const scheduler = require('../src/scheduler');

(async () => {
  await store.load();
  scheduler.start();
  console.log('Scheduler running. Press Ctrl+C to stop.');
})();
