// Lists the 20 most-booked companies in slots (events.company / companyName) that the placement slider doesn't show yet,
// as ready-to-paste src/data/marqueeCompanies.js lines with a random placed count.
// Run: node --env-file=.env scripts/slot-companies.mjs
// Cost: 1 read per slot document (events are publicly readable; only the two company fields are downloaded).
import MARQUEE from '../src/data/marqueeCompanies.js';

const { REACT_APP_FIREBASE_PROJECT_ID: project, REACT_APP_FIREBASE_API_KEY: key } = process.env;
const res = await fetch(
  `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery?key=${key}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'events' }], select: { fields: [{ fieldPath: 'company' }, { fieldPath: 'companyName' }] } } }),
  },
);
const rows = await res.json();
if (!res.ok || rows[0]?.error) throw new Error(JSON.stringify(rows[0]?.error ?? rows));

// Same company typed differently ("tcs", "TCS ", "T.C.S") counts once; the most used spelling is shown.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const known = new Set(MARQUEE.flatMap((c) => [norm(c.id), norm(c.alt)]));
const seen = new Map(); // norm -> { spellings: Map(name -> count), slots }
for (const r of rows) {
  const f = r.document?.fields ?? {};
  const name = String(f.company?.stringValue || f.companyName?.stringValue || '').trim().replace(/\s+/g, ' ');
  const k = norm(name);
  if (!k || known.has(k)) continue;
  const e = seen.get(k) ?? { spellings: new Map(), slots: 0 };
  e.spellings.set(name, (e.spellings.get(name) ?? 0) + 1);
  e.slots += 1;
  seen.set(k, e);
}

const top = [...seen].sort((a, b) => b[1].slots - a[1].slots).slice(0, 20); // most booked first
console.log(`${rows.filter((r) => r.document).length} slots read, ${seen.size} new companies, top ${top.length}:\n`);
for (const [k, e] of top) {
  const alt = [...e.spellings].sort((a, b) => b[1] - a[1])[0][0];
  const placed = 5 + Math.floor(Math.random() * 16); // ponytail: made-up count (5–20), as asked
  console.log(`  { id: '${k}', alt: ${JSON.stringify(alt)}, placed: ${placed}, logo: false }, // ${e.slots} slots`);
}
