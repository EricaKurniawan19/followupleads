#!/usr/bin/env node
// Fills in real company website links for a scraped contact-list CSV.
//
// Input rows (no header) are expected in this order, matching the
// "Scraping_Contact_List" export this was built for:
//   First Name, Last Name, Job Title, Tenure, Company Name,
//   Company Location, LinkedIn Profile Link, LinkedIn Company Page
//
// For each row's Company Name we resolve a real website via Clearbit's
// free, unauthenticated company-autocomplete endpoint, caching by company
// name so 50k rows with far fewer unique companies only cost one lookup
// per company. Must be run somewhere with normal internet access — it
// will not work from a sandboxed/egress-restricted environment.
//
// Usage:
//   node bin/enrich-company-websites.js <input.csv> [options]
//
// Options:
//   --out=<path>          output CSV path (default: <input>.enriched.csv)
//   --cache=<path>        domain-lookup cache JSON (default: data/enrichment/company-domain-cache.json)
//   --limit=<n>           only resolve the first n unique company names (for a test run)
//   --concurrency=<n>     parallel lookups (default: 4)

const fs = require('fs');
const path = require('path');

const LOOKUP_URL = 'https://autocomplete.clearbit.com/v1/companies/suggest?query=';
const COLUMNS = [
  'firstName', 'lastName', 'jobTitle', 'tenure',
  'companyName', 'companyLocation', 'linkedinProfileLink', 'linkedinCompanyPage',
];
const OUTPUT_HEADER = [
  'First Name', 'Last Name', 'Job Title', 'Tenure', 'Company Name',
  'Company Location', 'LinkedIn Profile Link', 'LinkedIn Company Page',
  'Resolved Website', 'Resolution Confidence',
];

function parseArgs(argv) {
  const args = { _: [] };
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else args._.push(raw);
  }
  return args;
}

// Minimal RFC4180 CSV parser: handles quoted fields, embedded commas,
// escaped quotes ("") and both \n and \r\n line endings.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip, \n handles the line break
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function csvField(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvRow(values) {
  return values.map(csvField).join(',');
}

// Strip trailing parenthetical qualifiers ("Bank of China (Hong Kong)" ->
// "Bank of China") and common legal suffixes, as a fallback query when the
// exact name returns no match.
function simplifyCompanyName(name) {
  return name
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\b(Ltd\.?|Limited|Inc\.?|Corp\.?|Corporation|Co\.?|LLC|LLP|Group|plc|PLC)\.?\s*$/i, '')
    .trim();
}

async function lookupCompany(name, { retries = 3 } = {}) {
  const candidates = [name];
  const simplified = simplifyCompanyName(name);
  if (simplified && simplified !== name) candidates.push(simplified);

  for (const candidate of candidates) {
    if (!candidate) continue;
    let attempt = 0;
    while (attempt < retries) {
      attempt++;
      try {
        const res = await fetch(LOOKUP_URL + encodeURIComponent(candidate), {
          headers: { Accept: 'application/json' },
        });
        if (res.status === 429) {
          await sleep(500 * attempt);
          continue;
        }
        if (!res.ok) break;
        const suggestions = await res.json();
        if (Array.isArray(suggestions) && suggestions.length > 0) {
          const exact = suggestions.find(
            (s) => s.name && s.name.toLowerCase() === candidate.toLowerCase(),
          );
          const pick = exact || suggestions[0];
          if (pick && pick.domain) {
            return {
              website: `https://${pick.domain}`,
              confidence: exact ? 'exact' : 'fuzzy',
            };
          }
        }
        break; // no suggestions for this candidate, try the next one (if any)
      } catch (err) {
        if (attempt >= retries) break;
        await sleep(300 * attempt);
      }
    }
  }
  return { website: '', confidence: 'unresolved' };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runOne));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args._[0];
  if (!inputPath) {
    console.error('Usage: node bin/enrich-company-websites.js <input.csv> [--out=path] [--cache=path] [--limit=n] [--concurrency=n]');
    process.exit(1);
  }

  const outPath = args.out || inputPath.replace(/\.csv$/i, '') + '.enriched.csv';
  const cachePath = args.cache || path.join(__dirname, '..', 'data', 'enrichment', 'company-domain-cache.json');
  const concurrency = parseInt(args.concurrency, 10) || 4;
  const limit = args.limit ? parseInt(args.limit, 10) : Infinity;

  const raw = fs.readFileSync(inputPath, 'utf8');
  const rows = parseCsv(raw).map((r) => {
    const obj = {};
    COLUMNS.forEach((col, i) => { obj[col] = (r[i] || '').trim(); });
    return obj;
  });

  console.log(`Loaded ${rows.length} rows from ${inputPath}`);

  const uniqueNames = [...new Set(rows.map((r) => r.companyName).filter(Boolean))];
  console.log(`${uniqueNames.length} unique company names`);

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  let cache = {};
  if (fs.existsSync(cachePath)) {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    console.log(`Loaded ${Object.keys(cache).length} cached lookups from ${cachePath}`);
  }

  const toLookup = uniqueNames.filter((n) => !(n.toLowerCase() in cache)).slice(0, limit);
  console.log(`Looking up ${toLookup.length} new company names (concurrency=${concurrency})...`);

  let done = 0;
  let lastSave = Date.now();
  await runPool(toLookup, async (name) => {
    const result = await lookupCompany(name);
    cache[name.toLowerCase()] = result;
    done++;
    if (done % 100 === 0 || Date.now() - lastSave > 10000) {
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      lastSave = Date.now();
      console.log(`  ${done}/${toLookup.length} resolved...`);
    }
    return result;
  }, concurrency);
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));

  const outRows = [OUTPUT_HEADER];
  let exact = 0, fuzzy = 0, unresolved = 0;
  for (const r of rows) {
    const hit = r.companyName ? cache[r.companyName.toLowerCase()] : null;
    const website = hit ? hit.website : '';
    const confidence = hit ? hit.confidence : 'unresolved';
    if (confidence === 'exact') exact++;
    else if (confidence === 'fuzzy') fuzzy++;
    else unresolved++;
    outRows.push([
      r.firstName, r.lastName, r.jobTitle, r.tenure, r.companyName,
      r.companyLocation, r.linkedinProfileLink, r.linkedinCompanyPage,
      website, confidence,
    ]);
  }

  fs.writeFileSync(outPath, outRows.map(toCsvRow).join('\n') + '\n');

  console.log(`\nWrote ${rows.length} rows to ${outPath}`);
  console.log(`Website match summary (by row): exact=${exact}, fuzzy=${fuzzy}, unresolved=${unresolved}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
