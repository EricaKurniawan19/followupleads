require('dotenv').config();
const path = require('path');

module.exports = {
  capsule: {
    token: process.env.CAPSULE_API_TOKEN || '',
  },
  calendar: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob',
    // Comma-separated calendar IDs to check, e.g. "primary,admin@oxbridge-econ.com"
    // — useful when meetings get organized on a colleague's calendar you have
    // read access to. Defaults to just your own primary calendar.
    calendarIds: (process.env.GOOGLE_CALENDAR_IDS || 'primary')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Personal contacts (family, friends) who show up as "external" attendees
    // on a shared calendar but aren't leads — excluded regardless of domain.
    excludeEmails: (process.env.GOOGLE_CALENDAR_EXCLUDE_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    // If set, a meeting only counts as a lead when this address (e.g. the
    // person actually doing business development) is an attendee/organizer
    // AND there's an external attendee — filters out other internal meetings
    // that happen to have an external guest for unrelated reasons.
    requireAttendee: (process.env.GOOGLE_CALENDAR_REQUIRE_ATTENDEE || '').trim().toLowerCase(),
  },
  companyDomain: process.env.COMPANY_DOMAIN || 'oxbridge-econ.com',
  followUpDays: parseInt(process.env.FOLLOW_UP_DAYS || '7', 10),
  dataFile: process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'leads.json'),
  syncCron: process.env.SYNC_CRON || '0 7,15 * * *',
  port: parseInt(process.env.PORT || '3000', 10),
  schedulerEnabled: process.env.DISABLE_SCHEDULER !== 'true',
  gitBackup: {
    githubToken: process.env.GITHUB_TOKEN || '',
    githubRepo: process.env.GITHUB_REPO || '',
  },
};
