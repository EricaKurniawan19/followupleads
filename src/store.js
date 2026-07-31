const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const config = require('./config');

function emptyState() {
  return {
    settings: { followUpDays: config.followUpDays },
    leads: [],
    meta: {
      lastCapsuleSyncAt: null,
      lastCalendarSyncAt: null,
      lastRunAt: null,
      lastRunSummary: null,
    },
  };
}

let state = null;
let writeQueue = Promise.resolve();

function ensureDataDir() {
  const dir = path.dirname(config.dataFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function load() {
  if (state) return state;
  ensureDataDir();
  try {
    const raw = await fsp.readFile(config.dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    state = {
      ...emptyState(),
      ...parsed,
      settings: { ...emptyState().settings, ...(parsed.settings || {}) },
      meta: { ...emptyState().meta, ...(parsed.meta || {}) },
    };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    state = emptyState();
  }
  return state;
}

async function persist() {
  ensureDataDir();
  const tmpFile = `${config.dataFile}.tmp`;
  await fsp.writeFile(tmpFile, JSON.stringify(state, null, 2));
  await fsp.rename(tmpFile, config.dataFile);
}

// Serialized through a single-file promise chain so concurrent API writes
// and a scheduled sync run never interleave and corrupt the JSON on disk.
function save() {
  writeQueue = writeQueue.then(persist, persist);
  return writeQueue;
}

function getState() {
  if (!state) throw new Error('Store not loaded — call load() before getState().');
  return state;
}

module.exports = { load, save, getState };
