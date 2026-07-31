#!/usr/bin/env node
// Interactive helper to mint a Google OAuth refresh token for calendar.readonly.
// Run once locally: npm run get-google-token
const readline = require('readline');
const { google } = require('googleapis');
require('dotenv').config();

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (in .env or the environment) first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/calendar.readonly'],
});

console.log('1. Open this URL and authorize access:\n');
console.log(authUrl);
console.log('\n2. Paste the authorization code you receive below.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Code: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    if (!tokens.refresh_token) {
      console.warn(
        '\nNo refresh_token returned — you may have already authorized this app.\n' +
          'Revoke access at https://myaccount.google.com/permissions and try again.'
      );
      return;
    }
    console.log('\nSuccess. Add this to your .env / repo secrets:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } catch (err) {
    console.error('Failed to exchange code:', err.message);
    process.exit(1);
  }
});
