const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const config = require('./config');

// On hosts with ephemeral disks (e.g. Render's free tier), the data file
// doesn't survive a restart. If a GITHUB_TOKEN + GITHUB_REPO are configured,
// back every write up to the repo so a restart just re-clones the latest
// state instead of losing it.
function git(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: path.join(__dirname, '..'), ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

async function backupToGit() {
  const { githubToken, githubRepo } = config.gitBackup;
  if (!githubToken || !githubRepo) return;
  const relPath = path.relative(path.join(__dirname, '..'), config.dataFile);
  try {
    await git(['add', relPath]);
    const diff = await git(['diff', '--cached', '--name-only']);
    if (!diff.trim()) return; // nothing changed
    await git(['-c', 'user.name=followup-ledger', '-c', 'user.email=noreply@followup-ledger.local', 'commit', '-m', 'chore: update leads via web UI']);
    const remote = `https://${githubToken}@github.com/${githubRepo}.git`;
    await git(['push', remote, 'HEAD:main']);
  } catch (err) {
    console.error('[store] git backup failed (edit is still saved locally):', err.message);
  }
}

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
  await backupToGit();
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
