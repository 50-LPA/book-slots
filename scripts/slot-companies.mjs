// Lists the 20 most-booked companies in slots (events.company / companyName) that the placement slider doesn't show yet,
// as ready-to-paste src/data/marqueeCompanies.js lines with a random placed count.
// Run: FIREBASE_CLIENT_EMAIL=… FIREBASE_PRIVATE_KEY=… REACT_APP_FIREBASE_PROJECT_ID=… node scripts/slot-companies.mjs
// Cost: 1 read per slot document (events are admin-only, so this uses the Admin SDK; only the two company fields are downloaded).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import MARQUEE from '../src/data/marqueeCompanies.js';

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
initializeApp({
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
  projectId,
});
const snap = await getFirestore().collection('events').select('company', 'companyName').get();

// Same company typed differently ("tcs", "TCS ", "T.C.S") counts once; the most used spelling is shown.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const known = new Set(MARQUEE.flatMap((c) => [norm(c.id), norm(c.alt)]));
const seen = new Map(); // norm -> { spellings: Map(name -> count), slots }
for (const d of snap.docs) {
  const f = d.data();
  const name = String(f.company || f.companyName || '').trim().replace(/\s+/g, ' ');
  const k = norm(name);
  if (!k || known.has(k)) continue;
  const e = seen.get(k) ?? { spellings: new Map(), slots: 0 };
  e.spellings.set(name, (e.spellings.get(name) ?? 0) + 1);
  e.slots += 1;
  seen.set(k, e);
}

const top = [...seen].sort((a, b) => b[1].slots - a[1].slots).slice(0, 20); // most booked first
console.log(`${snap.size} slots read, ${seen.size} new companies, top ${top.length}:\n`);
for (const [k, e] of top) {
  const alt = [...e.spellings].sort((a, b) => b[1] - a[1])[0][0];
  const placed = 5 + Math.floor(Math.random() * 16); // ponytail: made-up count (5–20), as asked
  console.log(`  { id: '${k}', alt: ${JSON.stringify(alt)}, placed: ${placed}, logo: false }, // ${e.slots} slots`);
}
