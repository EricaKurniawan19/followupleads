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
