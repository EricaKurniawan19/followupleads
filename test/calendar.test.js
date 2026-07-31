const test = require('node:test');
const assert = require('node:assert/strict');
const { eventsToLeads, domainOf, upcomingExternalMeetings, dedupeById, eventHasAttendee } = require('../src/sync/calendar');

const NOW = new Date('2026-07-31T12:00:00Z');
const COMPANY_DOMAIN = 'oxbridge-econ.com';

test('domainOf extracts lowercased domain', () => {
  assert.equal(domainOf('Jane@Example.COM'), 'example.com');
  assert.equal(domainOf(''), '');
  assert.equal(domainOf(undefined), '');
});

test('excludes events where every attendee is internal', () => {
  const events = [
    {
      id: 'evt1',
      end: { dateTime: '2026-07-30T10:00:00Z' },
      attendees: [
        { email: 'erica@oxbridge-econ.com', self: true },
        { email: 'tiffany@oxbridge-econ.com' },
      ],
    },
  ];
  const leads = eventsToLeads(events, { companyDomain: COMPANY_DOMAIN, now: NOW });
  assert.equal(leads.length, 0);
});

test('includes a lead for an external attendee on a completed meeting', () => {
  const events = [
    {
      id: 'evt2',
      summary: 'Intro call',
      end: { dateTime: '2026-07-30T10:00:00Z' },
      attendees: [
        { email: 'erica@oxbridge-econ.com', self: true },
        { email: 'lead@external.com', displayName: 'External Lead' },
      ],
    },
  ];
  const leads = eventsToLeads(events, { companyDomain: COMPANY_DOMAIN, now: NOW });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].name, 'External Lead');
  assert.equal(leads[0].email, 'lead@external.com');
  assert.equal(leads[0].meetingDate, '2026-07-30');
  assert.equal(leads[0].sourceKey, 'calendar:evt2');
  assert.equal(leads[0].source, 'calendar');
});

test('skips events that have not ended yet', () => {
  const events = [
    {
      id: 'evt3',
      end: { dateTime: '2026-08-05T10:00:00Z' },
      attendees: [{ email: 'lead@external.com' }],
    },
  ];
  const leads = eventsToLeads(events, { companyDomain: COMPANY_DOMAIN, now: NOW });
  assert.equal(leads.length, 0);
});

test('skips all-day events with no end dateTime', () => {
  const events = [
    {
      id: 'evt4',
      end: { date: '2026-07-30' },
      attendees: [{ email: 'lead@external.com' }],
    },
  ];
  const leads = eventsToLeads(events, { companyDomain: COMPANY_DOMAIN, now: NOW });
  assert.equal(leads.length, 0);
});

test('skips cancelled events', () => {
  const events = [
    {
      id: 'evt5',
      status: 'cancelled',
      end: { dateTime: '2026-07-30T10:00:00Z' },
      attendees: [{ email: 'lead@external.com' }],
    },
  ];
  const leads = eventsToLeads(events, { companyDomain: COMPANY_DOMAIN, now: NOW });
  assert.equal(leads.length, 0);
});

test('upcomingExternalMeetings includes future meetings with external attendees', () => {
  const events = [
    {
      id: 'evt7',
      summary: 'Catch up',
      start: { dateTime: '2026-08-01T10:00:00Z' },
      attendees: [{ email: 'erica@oxbridge-econ.com', self: true }, { email: 'lead@external.com', displayName: 'External Lead' }],
    },
  ];
  const meetings = upcomingExternalMeetings(events, { companyDomain: COMPANY_DOMAIN, now: NOW });
  assert.equal(meetings.length, 1);
  assert.equal(meetings[0].summary, 'Catch up');
  assert.equal(meetings[0].attendees[0].name, 'External Lead');
});

test('upcomingExternalMeetings excludes meetings that already started', () => {
  const events = [
    {
      id: 'evt8',
      start: { dateTime: '2026-07-30T10:00:00Z' },
      attendees: [{ email: 'lead@external.com' }],
    },
  ];
  const meetings = upcomingExternalMeetings(events, { companyDomain: COMPANY_DOMAIN, now: NOW });
  assert.equal(meetings.length, 0);
});

test('upcomingExternalMeetings excludes internal-only meetings', () => {
  const events = [
    {
      id: 'evt9',
      start: { dateTime: '2026-08-01T10:00:00Z' },
      attendees: [{ email: 'tiffany@oxbridge-econ.com' }],
    },
  ];
  const meetings = upcomingExternalMeetings(events, { companyDomain: COMPANY_DOMAIN, now: NOW });
  assert.equal(meetings.length, 0);
});

test('eventsToLeads excludes explicitly excluded personal contacts', () => {
  const events = [
    {
      id: 'evtP',
      end: { dateTime: '2026-07-30T10:00:00Z' },
      attendees: [{ email: 'family@personal.com' }],
    },
  ];
  const leads = eventsToLeads(events, {
    companyDomain: COMPANY_DOMAIN,
    excludeEmails: ['family@personal.com'],
    now: NOW,
  });
  assert.equal(leads.length, 0);
});

test('eventsToLeads with requireAttendee only counts meetings involving that person', () => {
  const events = [
    {
      id: 'evtQ1',
      end: { dateTime: '2026-07-30T10:00:00Z' },
      organizer: { email: 'admin@oxbridge-econ.com' },
      attendees: [{ email: 'lead@external.com' }],
    },
    {
      id: 'evtQ2',
      end: { dateTime: '2026-07-30T10:00:00Z' },
      organizer: { email: 'someoneelse@oxbridge-econ.com' },
      attendees: [{ email: 'lead2@external.com' }],
    },
  ];
  const leads = eventsToLeads(events, {
    companyDomain: COMPANY_DOMAIN,
    requireAttendee: 'admin@oxbridge-econ.com',
    now: NOW,
  });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].email, 'lead@external.com');
});

test('eventHasAttendee matches organizer or attendee list, case-insensitively', () => {
  assert.equal(eventHasAttendee({ organizer: { email: 'Admin@Oxbridge-Econ.com' } }, 'admin@oxbridge-econ.com'), true);
  assert.equal(eventHasAttendee({ attendees: [{ email: 'admin@oxbridge-econ.com' }] }, 'admin@oxbridge-econ.com'), true);
  assert.equal(eventHasAttendee({ attendees: [{ email: 'someone@else.com' }] }, 'admin@oxbridge-econ.com'), false);
  assert.equal(eventHasAttendee({ attendees: [] }, ''), true);
});

test('dedupeById keeps only the first copy of a shared invite seen across calendars', () => {
  const events = [{ id: 'a', summary: 'x' }, { id: 'b', summary: 'y' }, { id: 'a', summary: 'x (from other calendar)' }];
  const result = dedupeById(events);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((e) => e.id), ['a', 'b']);
});

test('multiple external attendees each get a lead with a disambiguated sourceKey', () => {
  const events = [
    {
      id: 'evt6',
      end: { dateTime: '2026-07-30T10:00:00Z' },
      attendees: [
        { email: 'a@external.com' },
        { email: 'b@external.com' },
      ],
    },
  ];
  const leads = eventsToLeads(events, { companyDomain: COMPANY_DOMAIN, now: NOW });
  assert.equal(leads.length, 2);
  assert.equal(leads[0].sourceKey, 'calendar:evt6:a@external.com');
  assert.equal(leads[1].sourceKey, 'calendar:evt6:b@external.com');
});
