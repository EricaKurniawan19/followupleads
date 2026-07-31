const test = require('node:test');
const assert = require('node:assert/strict');
const { partyName, extractContactFields, extractLinkedin, entryDate, entryContent } = require('../src/sync/capsule');

test('partyName prefers person first/last name', () => {
  assert.equal(partyName({ firstName: 'Jane', lastName: 'Cooper' }), 'Jane Cooper');
});

test('partyName falls back to organisation name', () => {
  assert.equal(partyName({ type: 'organisation', name: 'Acme Co' }), 'Acme Co');
});

test('extractContactFields pulls first email/phone and tag names', () => {
  const party = {
    emailAddresses: [{ address: 'jane@acme.com' }],
    phoneNumbers: [{ number: '+1 555 0100' }],
    tags: [{ name: 'Important' }, { name: 'LinkedIn' }],
  };
  const fields = extractContactFields(party);
  assert.equal(fields.email, 'jane@acme.com');
  assert.equal(fields.phone, '+1 555 0100');
  assert.deepEqual(fields.tags, ['Important', 'LinkedIn']);
});

test('extractLinkedin matches a website tagged linkedin or containing linkedin.com', () => {
  const party = { websites: [{ service: 'linkedin', url: 'https://linkedin.com/in/janecooper' }] };
  assert.equal(extractLinkedin(party), 'https://linkedin.com/in/janecooper');

  const partyNoService = { websites: [{ address: 'https://www.linkedin.com/in/janecooper' }] };
  assert.equal(extractLinkedin(partyNoService), 'https://www.linkedin.com/in/janecooper');

  const partyNone = { websites: [{ url: 'https://acme.com' }] };
  assert.equal(extractLinkedin(partyNone), '');
});

test('entryDate normalizes to YYYY-MM-DD from either field name', () => {
  assert.equal(entryDate({ entryDate: '2026-07-30T09:00:00Z' }), '2026-07-30');
  assert.equal(entryDate({ createdAt: '2026-07-29T09:00:00Z' }), '2026-07-29');
  assert.equal(entryDate({}), null);
});

test('entryContent falls back across content/description/note', () => {
  assert.equal(entryContent({ content: 'a' }), 'a');
  assert.equal(entryContent({ description: 'b' }), 'b');
  assert.equal(entryContent({ note: 'c' }), 'c');
  assert.equal(entryContent({}), '');
});
