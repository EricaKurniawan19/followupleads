const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeLeads } = require('../src/sync/merge');

let counter = 0;
function uuid() {
  counter += 1;
  return `test-id-${counter}`;
}

test('adds a new lead when no existing match', () => {
  const leads = [];
  const summary = mergeLeads(
    leads,
    [{ name: 'Jane Doe', source: 'capsule', meetingDate: '2026-07-01', notes: 'hi', sourceKey: 'capsule:1' }],
    { followUpDays: 7, uuid }
  );
  assert.equal(summary.added, 1);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].followUpDate, '2026-07-08');
  assert.equal(leads[0].status, 'pending');
});

test('dedupes by sourceKey and never overwrites notes or status', () => {
  const leads = [
    {
      id: '1',
      name: 'Jane Doe',
      source: 'capsule',
      meetingDate: '2026-07-01',
      followUpDate: '2026-07-08',
      notes: 'human edited notes',
      status: 'done',
      email: '',
      phone: '',
      linkedin: '',
      tags: [],
      sourceKey: 'capsule:1',
    },
  ];
  const summary = mergeLeads(
    leads,
    [
      {
        name: 'Jane Doe',
        source: 'capsule',
        meetingDate: '2026-07-01',
        notes: 'new notes from resync — should be ignored',
        email: 'jane@example.com',
        sourceKey: 'capsule:1',
      },
    ],
    { followUpDays: 7, uuid }
  );
  assert.equal(summary.added, 0);
  assert.equal(summary.updated, 1);
  assert.equal(leads[0].notes, 'human edited notes');
  assert.equal(leads[0].status, 'done');
  assert.equal(leads[0].email, 'jane@example.com');
});

test('dedupes by name + meetingDate when no sourceKey match', () => {
  const leads = [
    {
      id: '1',
      name: 'John Smith',
      source: 'manual',
      meetingDate: '2026-07-01',
      followUpDate: '2026-07-08',
      notes: '',
      status: 'pending',
      email: '',
      phone: '',
      linkedin: '',
      tags: [],
      sourceKey: null,
    },
  ];
  const summary = mergeLeads(
    leads,
    [{ name: 'john smith', source: 'calendar', meetingDate: '2026-07-01', notes: 'meeting', email: 'john@ext.com' }],
    { followUpDays: 7, uuid }
  );
  assert.equal(summary.added, 0);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].email, 'john@ext.com');
});

test('only fills empty contact fields, never overwrites populated ones', () => {
  const leads = [
    {
      id: '1',
      name: 'Amy',
      source: 'capsule',
      meetingDate: '2026-07-01',
      followUpDate: '2026-07-08',
      notes: '',
      status: 'pending',
      email: 'amy@old.com',
      phone: '',
      linkedin: '',
      tags: ['LinkedIn'],
      sourceKey: 'capsule:2',
    },
  ];
  mergeLeads(
    leads,
    [
      {
        name: 'Amy',
        source: 'capsule',
        meetingDate: '2026-07-01',
        notes: '',
        email: 'amy@new.com',
        phone: '555-0100',
        tags: ['Important'],
        sourceKey: 'capsule:2',
      },
    ],
    { followUpDays: 7, uuid }
  );
  assert.equal(leads[0].email, 'amy@old.com');
  assert.equal(leads[0].phone, '555-0100');
  assert.deepEqual([...leads[0].tags].sort(), ['Important', 'LinkedIn']);
});

test('a resync with no new candidates leaves existing leads untouched', () => {
  const leads = [
    {
      id: '1',
      name: 'Amy',
      source: 'capsule',
      meetingDate: '2026-07-01',
      followUpDate: '2026-07-08',
      notes: 'x',
      status: 'pending',
      email: 'amy@old.com',
      phone: '555',
      linkedin: '',
      tags: [],
      sourceKey: 'capsule:2',
    },
  ];
  const summary = mergeLeads(leads, [], { followUpDays: 7, uuid });
  assert.equal(summary.added, 0);
  assert.equal(summary.updated, 0);
  assert.equal(leads.length, 1);
});
