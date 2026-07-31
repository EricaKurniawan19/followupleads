const { addDays } = require('../utils/dates');

function normalizeName(n) {
  return (n || '').trim().toLowerCase();
}

function findExisting(leads, candidate) {
  if (candidate.sourceKey) {
    const bySourceKey = leads.find((l) => l.sourceKey === candidate.sourceKey);
    if (bySourceKey) return bySourceKey;
  }
  return (
    leads.find(
      (l) => normalizeName(l.name) === normalizeName(candidate.name) && l.meetingDate === candidate.meetingDate
    ) || null
  );
}

// Notes and status are human-edited — a re-sync must never touch them.
// Contact fields and tags only get filled in when currently empty.
function fillEmptyFields(existing, candidate) {
  let changed = false;
  for (const field of ['email', 'phone', 'linkedin']) {
    if (!existing[field] && candidate[field]) {
      existing[field] = candidate[field];
      changed = true;
    }
  }
  if (candidate.tags && candidate.tags.length) {
    const merged = Array.from(new Set([...(existing.tags || []), ...candidate.tags]));
    if (merged.length !== (existing.tags || []).length) {
      existing.tags = merged;
      changed = true;
    }
  }
  return changed;
}

/**
 * Merges lead candidates into an existing leads array in place.
 * @param {Array} existingLeads - mutated in place
 * @param {Array} candidates - lead candidates from capsule/calendar sync
 * @param {object} opts - { followUpDays, uuid }
 * @returns {{added:number, updated:number, unchanged:number}}
 */
function mergeLeads(existingLeads, candidates, { followUpDays, uuid }) {
  const summary = { added: 0, updated: 0, unchanged: 0 };

  for (const candidate of candidates) {
    const existing = findExisting(existingLeads, candidate);
    if (existing) {
      if (fillEmptyFields(existing, candidate)) summary.updated++;
      else summary.unchanged++;
      continue;
    }

    const meetingDate = candidate.meetingDate;
    existingLeads.push({
      id: uuid(),
      name: candidate.name,
      source: candidate.source,
      meetingDate,
      followUpDate: addDays(meetingDate, followUpDays),
      notes: candidate.notes || '',
      status: 'pending',
      email: candidate.email || '',
      phone: candidate.phone || '',
      linkedin: candidate.linkedin || '',
      tags: candidate.tags || [],
      sourceKey: candidate.sourceKey || null,
    });
    summary.added++;
  }

  return summary;
}

module.exports = { mergeLeads, findExisting, fillEmptyFields };
