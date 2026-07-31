const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('save() is a safe no-op for git backup when GITHUB_TOKEN/GITHUB_REPO are unset', async () => {
  const tmpFile = path.join(os.tmpdir(), `store-test-${Date.now()}.json`);
  const prevDataFile = process.env.DATA_FILE;
  process.env.DATA_FILE = tmpFile;
  delete require.cache[require.resolve('../src/config')];
  delete require.cache[require.resolve('../src/store')];
  const store = require('../src/store');

  try {
    await store.load();
    const state = store.getState();
    state.leads.push({ id: 'x', name: 'Test', status: 'pending' });
    await store.save(); // must not throw even without git backup configured
    assert.equal(JSON.parse(fs.readFileSync(tmpFile, 'utf8')).leads.length, 1);
  } finally {
    if (prevDataFile === undefined) delete process.env.DATA_FILE;
    else process.env.DATA_FILE = prevDataFile;
    fs.rmSync(tmpFile, { force: true });
    fs.rmSync(`${tmpFile}.tmp`, { force: true });
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/store')];
  }
});
