const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const store = require('./store');
const config = require('./config');
const { runSync } = require('./sync/runSync');
const { fetchUpcomingExternalMeetings } = require('./sync/calendar');
const { addDays, todayISO } = require('./utils/dates');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function parseTags(value) {
  if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

app.get('/api/state', (req, res) => {
  res.json(store.getState());
});

app.put('/api/settings', async (req, res) => {
  const state = store.getState();
  const followUpDays = parseInt(req.body.followUpDays, 10);
  if (!Number.isFinite(followUpDays) || followUpDays < 1) {
    return res.status(400).json({ error: 'followUpDays must be a positive integer' });
  }
  state.settings.followUpDays = followUpDays;
  await store.save();
  res.json(state.settings);
});

app.post('/api/leads', async (req, res) => {
  const state = store.getState();
  const { name, meetingDate, notes, email, phone, linkedin, tags } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const mDate = meetingDate || todayISO();
  const lead = {
    id: randomUUID(),
    name: String(name).trim(),
    source: 'manual',
    meetingDate: mDate,
    followUpDate: addDays(mDate, state.settings.followUpDays || 7),
    notes: (notes || '').trim(),
    status: 'pending',
    email: (email || '').trim(),
    phone: (phone || '').trim(),
    linkedin: (linkedin || '').trim(),
    tags: parseTags(tags),
    sourceKey: null,
  };
  state.leads.push(lead);
  await store.save();
  res.status(201).json(lead);
});

app.patch('/api/leads/:id', async (req, res) => {
  const state = store.getState();
  const lead = state.leads.find((l) => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead not found' });

  const directFields = ['status', 'followUpDate', 'name', 'meetingDate', 'email', 'phone', 'linkedin', 'notes'];
  for (const field of directFields) {
    if (req.body[field] !== undefined) lead[field] = req.body[field];
  }
  if (req.body.tags !== undefined) lead.tags = parseTags(req.body.tags);

  await store.save();
  res.json(lead);
});

app.delete('/api/leads/:id', async (req, res) => {
  const state = store.getState();
  const before = state.leads.length;
  state.leads = state.leads.filter((l) => l.id !== req.params.id);
  if (state.leads.length === before) return res.status(404).json({ error: 'lead not found' });
  await store.save();
  res.status(204).end();
});

app.post('/api/leads/bulk-mark-overdue-done', async (req, res) => {
  const state = store.getState();
  const today = todayISO();
  let marked = 0;
  for (const lead of state.leads) {
    if (lead.status !== 'done' && lead.followUpDate < today) {
      lead.status = 'done';
      marked++;
    }
  }
  await store.save();
  res.json({ marked });
});

app.get('/api/upcoming', async (req, res) => {
  try {
    const upcoming = await fetchUpcomingExternalMeetings(config.calendar, {
      companyDomain: config.companyDomain,
      daysAhead: 14,
    });
    res.json(upcoming);
  } catch (err) {
    console.error('[api] upcoming fetch failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync', async (req, res) => {
  try {
    const summary = await runSync();
    res.json(summary);
  } catch (err) {
    console.error('[api] manual sync failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
