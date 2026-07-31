# Follow-Up Ledger — sync & scheduler layer

Background service that watches Capsule CRM and Google Calendar on a
schedule and keeps a ledger of leads that need a follow-up ~7 days after a
meeting. This is the server-side counterpart to the `followup.html`
browser prototype: the UI/UX is unchanged, but syncing no longer requires a
person to click a button — it runs unattended, on a schedule, from a real
process that can call third-party APIs directly.

## How it fits together

```
src/
  config.js          env-driven configuration
  store.js           JSON file storage (leads + settings + sync metadata), atomic writes
  server.js           Express app: serves public/ and a small JSON API
  scheduler.js         node-cron wrapper that runs a sync on a schedule
  digest.js            builds a text digest of new/overdue leads, optional Slack post
  sync/
    capsule.js          Capsule CRM client + party/history → lead-candidate mapping
    calendar.js          Google Calendar client + internal/external filter → lead-candidate mapping
    merge.js              dedupe + merge lead candidates into the ledger
    runSync.js             orchestrates capsule + calendar + merge + persist

bin/
  serve.js       web server + built-in scheduler (the "always-on small server" option)
  schedule.js     scheduler only, no web server (the "local machine that's on" option)
  sync-once.js     one-shot sync for external cron/systemd/GitHub Actions
  get-google-token.js  interactive helper to mint a Calendar OAuth refresh token

public/index.html  adapted from followup.html — same UI, backed by the API instead of window.storage
data/leads.json     the JSON store (committed, so the GitHub Actions workflow can update it in place)
.github/workflows/sync.yml  scheduled workflow alternative to running your own server
```

## Data model

Same as the prototype:

```json
{
  "id": "uuid",
  "name": "string — person or company",
  "source": "capsule | calendar | manual",
  "meetingDate": "YYYY-MM-DD",
  "followUpDate": "YYYY-MM-DD",
  "notes": "string, human-editable",
  "status": "pending | done",
  "email": "string, optional",
  "phone": "string, optional",
  "linkedin": "string (url), optional",
  "tags": ["string", "..."],
  "sourceKey": "string — dedupe key, e.g. capsule:<entryId> or calendar:<eventId>"
}
```

Contacts are a derived view (grouped by name), computed client-side from the
leads list — there's no separate contacts table.

## Setup

```bash
npm install
cp .env.example .env
```

### Capsule CRM

Generate a personal access token: Capsule → My Preferences → API
Authentication Tokens. Set `CAPSULE_API_TOKEN` in `.env`.

### Google Calendar

1. Create an OAuth client in Google Cloud Console (type "Desktop app" is
   simplest), scope `https://www.googleapis.com/auth/calendar.readonly`.
2. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.
3. Run `npm run get-google-token`, open the printed URL, authorize, paste
   the code back in. It prints a `GOOGLE_REFRESH_TOKEN` to add to `.env`
   (or to your GitHub Actions secrets).

### Company domain

`COMPANY_DOMAIN` (default `oxbridge-econ.com`) is used to tell internal
team meetings apart from external lead meetings — a calendar event is only
synced as a lead if at least one attendee is on a *different* domain.

## Running it

Pick one:

- **`npm run serve`** — starts the web UI (`public/index.html` at
  `http://localhost:3000`) *and* the background scheduler in the same
  process. Good for a small always-on server (Render, Fly.io, a VPS).
- **`npm run schedule`** — scheduler only, no web UI. For a local machine
  that's on and you don't need the ledger view there.
- **`npm run sync`** — runs one sync pass and exits. For an external cron
  job, a systemd timer, or the GitHub Actions workflow below.
- **GitHub Actions** (`.github/workflows/sync.yml`) — runs `npm run sync`
  on a schedule and commits the updated `data/leads.json` back to the repo.
  No server to keep alive; needs the Capsule/Google secrets set on the repo
  (Settings → Secrets and variables → Actions).
- **A hosted web server** (e.g. Render's free tier) — runs `npm run serve`
  continuously so you get a real, editable web UI at a permanent URL. Free
  tiers typically have an *ephemeral* disk, so also set `GITHUB_TOKEN`
  (a classic PAT with `repo` scope) and `GITHUB_REPO` — every save then
  gets committed back to the repo, so a restart re-clones the latest data
  instead of losing edits made through the UI.

`SYNC_CRON` controls the schedule for `serve`/`schedule` (default twice
daily, 7am and 3pm). The GitHub Actions workflow has its own `cron:` line
in the YAML.

## Sync & merge rules

- **Capsule**: paginate `GET /parties?embed=tags` (no `sort` param — it
  400s), then `GET /parties/{id}/history` per party, paginated. Each
  history entry becomes one lead candidate, dated by the entry's own date
  field (not the party's `lastContactedAt`) — that field didn't reliably
  reflect individual notes during prototyping. **Verify the exact history
  response shape against a real Capsule account** — `src/sync/capsule.js`
  reads `entries`/`history` and `entryDate`/`createdAt`/`date` defensively,
  but Capsule's API has changed field names across versions before.
- **Calendar**: `events.list` on the primary calendar for events whose
  `end.dateTime` is in the past. Events where every attendee shares
  `COMPANY_DOMAIN` are skipped; each external attendee becomes a lead
  candidate using their calendar email directly.
- **Merge** (`src/sync/merge.js`): dedupe by `sourceKey` first, falling
  back to `name + meetingDate`. A match never touches `notes` or `status`
  (human-edited) — only empty `email`/`phone`/`linkedin` get filled in, and
  `tags` are unioned. Non-matches are added as new leads with
  `followUpDate = meetingDate + settings.followUpDays` (default 7).

## API (used by public/index.html)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/state` | full state: settings, leads, sync metadata |
| PUT | `/api/settings` | update `followUpDays` |
| POST | `/api/leads` | add a manual lead |
| PATCH | `/api/leads/:id` | update any lead field (status, snooze, edits) |
| DELETE | `/api/leads/:id` | remove a lead |
| POST | `/api/leads/bulk-mark-overdue-done` | mark all overdue leads followed up |
| POST | `/api/sync` | trigger a sync pass on demand |

## Tests

```bash
npm test
```

Covers the merge/dedupe rules and the calendar internal/external filter and
Capsule field-extraction helpers as pure functions — no live API
credentials needed.
