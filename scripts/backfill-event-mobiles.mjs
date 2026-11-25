// One-off: give every event a `candidateMobile` (10 digits), so a candidate's slots load with one query on mobile.
// Older events carry only `candidateId` (a mobile, or a candidates doc id). Dry run unless --write.
// Run: FIREBASE_CLIENT_EMAIL=… FIREBASE_PRIVATE_KEY=… REACT_APP_FIREBASE_PROJECT_ID=… node scripts/backfill-event-mobiles.mjs [--write]
// Cost: 1 read per event + 1 per candidate; 1 write per event fixed (sets updatedAt so device copies pick it up).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
initializeApp({
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
  projectId,
});
const db = getFirestore();
const write = process.argv.includes('--write');
const mobileOf = (v) => {
  const d = String(v ?? '').replace(/\D/g, '').slice(-10);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
};

const byId = new Map((await db.collection('candidates').get()).docs.map((d) => [d.id, mobileOf(d.data().mobile ?? d.data().phone)]));
const fixes = [];
const unresolved = [];
for (const d of (await db.collection('events').get()).docs) {
  const e = d.data();
  if (mobileOf(e.candidateMobile)) continue;
  const id = String(e.candidateId ?? '').trim();
  const mobile = mobileOf(e.mobile) || mobileOf(id) || byId.get(id) || '';
  if (mobile) fixes.push([d.ref, mobile]);
  else unresolved.push(d.id);
}
if (write) {
  for (let i = 0; i < fixes.length; i += 400) {
    const batch = db.batch();
    fixes.slice(i, i + 400).forEach(([ref, candidateMobile]) => batch.update(ref, { candidateMobile, updatedAt: FieldValue.serverTimestamp() }));
    await batch.commit();
  }
}
console.log(`${write ? 'Set' : 'Would set'} candidateMobile on ${fixes.length} events; ${unresolved.length} unresolved${unresolved.length ? ': ' + unresolved.slice(0, 10).join(', ') : ''}.`);
