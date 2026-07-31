const { google } = require('googleapis');

function domainOf(email) {
  return (email || '').split('@')[1]?.toLowerCase() || '';
}

/**
 * Pure transform from raw Calendar API events to lead candidates. Kept
 * separate from the network call so the filtering rules are unit-testable
 * without live credentials.
 */
function eventsToLeads(events, { companyDomain, now = new Date() }) {
  const domain = (companyDomain || '').toLowerCase();
  const leads = [];

  for (const event of events || []) {
    if (event.status === 'cancelled') continue;

    const endIso = event.end && event.end.dateTime;
    if (!endIso) continue; // no dateTime (e.g. all-day event) — no reliable "completed" signal
    if (new Date(endIso) > now) continue; // hasn't actually happened yet

    const attendees = (event.attendees || []).filter((a) => !a.resource && !a.self);
    if (attendees.length === 0) continue;

    // Internal vs. external filter: skip meetings where every attendee is on
    // the company's own domain — only external attendees count as a "lead".
    const external = attendees.filter((a) => domainOf(a.email) !== domain);
    if (external.length === 0) continue;

    const meetingDate = endIso.slice(0, 10);
    const notes = [event.summary, event.description].filter(Boolean).join(' — ');

    for (const attendee of external) {
      leads.push({
        name: attendee.displayName || attendee.email,
        source: 'calendar',
        meetingDate,
        notes,
        email: attendee.email || '',
        sourceKey:
          external.length === 1 ? `calendar:${event.id}` : `calendar:${event.id}:${attendee.email}`,
      });
    }
  }

  return leads;
}

function buildOAuthClient({ clientId, clientSecret, redirectUri, refreshToken }) {
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

async function listCompletedEvents(calendarConfig, { since } = {}) {
  const { clientId, clientSecret, refreshToken, redirectUri } = calendarConfig;
  const auth = buildOAuthClient({ clientId, clientSecret, redirectUri, refreshToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const timeMin = since ? new Date(since) : new Date(now.getTime() - 30 * 86400000);

  const events = [];
  let pageToken;
  do {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: now.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    });
    events.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return events;
}

/**
 * @param {object} calendarConfig - { clientId, clientSecret, refreshToken, redirectUri }
 * @param {object} opts - { companyDomain, since }
 */
async function fetchCalendarLeads(calendarConfig, { companyDomain, since } = {}) {
  const { clientId, clientSecret, refreshToken } = calendarConfig || {};
  if (!clientId || !clientSecret || !refreshToken) return [];
  const events = await listCompletedEvents(calendarConfig, { since });
  return eventsToLeads(events, { companyDomain });
}

module.exports = { fetchCalendarLeads, eventsToLeads, domainOf, listCompletedEvents };
