const BASE_URL = 'https://api.capsulecrm.com/api/v2/';

async function capsuleGet(token, pathAndQuery) {
  const res = await fetch(`${BASE_URL}${pathAndQuery}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Capsule API ${res.status} ${res.statusText} on ${pathAndQuery}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Capsule 400s if a `sort` param is present on /parties — deliberately omitted.
async function listAllParties(token) {
  const parties = [];
  let page = 1;
  const perPage = 100;
  for (;;) {
    const data = await capsuleGet(token, `parties?page=${page}&perPage=${perPage}&embed=tags`);
    const batch = data.parties || [];
    parties.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return parties;
}

async function listPartyHistory(token, partyId) {
  const entries = [];
  let page = 1;
  const perPage = 100;
  for (;;) {
    const data = await capsuleGet(token, `parties/${partyId}/history?page=${page}&perPage=${perPage}`);
    // NOTE: verify this key against a real Capsule account before relying on it —
    // the prototype found the "list all activity" endpoint didn't reliably surface
    // notes via the party-level lastContactedAt field, so we read each party's own
    // history and trust the entry's own date instead. The exact wrapper key
    // (`entries` vs `history`) may also differ by API version; both are handled.
    const batch = data.entries || data.history || [];
    entries.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return entries;
}

function partyName(party) {
  if (party.type === 'organisation' || party.organisationName) {
    return party.name || party.organisationName || 'Unknown organisation';
  }
  const first = party.firstName || '';
  const last = party.lastName || '';
  return (party.name || `${first} ${last}`).trim() || 'Unknown contact';
}

function extractLinkedin(party) {
  const sites = party.websites || [];
  const li = sites.find((w) => {
    const service = (w.service || w.type || '').toLowerCase();
    const url = (w.url || w.address || '').toLowerCase();
    return service === 'linkedin' || url.includes('linkedin.com');
  });
  return li ? li.url || li.address || '' : '';
}

function extractContactFields(party) {
  const email = (party.emailAddresses && party.emailAddresses[0] && party.emailAddresses[0].address) || '';
  const phone = (party.phoneNumbers && party.phoneNumbers[0] && party.phoneNumbers[0].number) || '';
  const linkedin = extractLinkedin(party);
  const tags = (party.tags || []).map((t) => t.name).filter(Boolean);
  return { email, phone, linkedin, tags };
}

function entryDate(entry) {
  const raw = entry.entryDate || entry.createdAt || entry.date;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function entryContent(entry) {
  return entry.content || entry.description || entry.note || '';
}

/**
 * Fetches every party + its history from Capsule and turns each history entry
 * into a lead candidate. Dedup/merge against existing leads happens later
 * (see sync/merge.js) — this module only extracts and shapes data.
 */
async function fetchCapsuleLeads(token) {
  if (!token) return [];
  const parties = await listAllParties(token);
  const leads = [];
  for (const party of parties) {
    const name = partyName(party);
    const contact = extractContactFields(party);

    let history;
    try {
      history = await listPartyHistory(token, party.id);
    } catch (err) {
      console.error(`[capsule] failed to fetch history for party ${party.id} (${name}): ${err.message}`);
      continue;
    }

    for (const entry of history) {
      const date = entryDate(entry);
      if (!date) continue;
      leads.push({
        name,
        source: 'capsule',
        meetingDate: date,
        notes: entryContent(entry),
        email: contact.email,
        phone: contact.phone,
        linkedin: contact.linkedin,
        tags: contact.tags,
        sourceKey: `capsule:${entry.id}`,
      });
    }
  }
  return leads;
}

module.exports = {
  fetchCapsuleLeads,
  listAllParties,
  listPartyHistory,
  partyName,
  extractContactFields,
  extractLinkedin,
  entryDate,
  entryContent,
};
