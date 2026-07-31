const { todayISO } = require('./utils/dates');

function buildDigest(state, summary) {
  const today = todayISO();
  const overdue = state.leads.filter((l) => l.status !== 'done' && l.followUpDate < today);

  const lines = [`Follow-up sync — ${today}`, `New leads added: ${summary.added}`];
  if (overdue.length) {
    lines.push(`Overdue follow-ups (${overdue.length}):`);
    for (const l of overdue) {
      lines.push(`  - ${l.name} — met ${l.meetingDate}, due ${l.followUpDate}`);
    }
  } else {
    lines.push('No overdue follow-ups.');
  }
  return lines.join('\n');
}

async function postToSlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('[digest] failed to post to Slack:', err.message);
  }
}

module.exports = { buildDigest, postToSlack };
