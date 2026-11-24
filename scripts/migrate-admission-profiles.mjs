// One-off: copy Firestore `profiles` → `admissionProfiles` (same ids, so resumes/{id} stay linked).
// Run: FIREBASE_CLIENT_EMAIL=… FIREBASE_PRIVATE_KEY=… REACT_APP_FIREBASE_PROJECT_ID=… node scripts/migrate-admission-profiles.mjs [--delete-old]
// Cost: 1 read + 1 write per profile (+1 delete each with --delete-old). Safe to re-run: set() overwrites with the same data.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
const deleteOld = process.argv.includes('--delete-old');

const snap = await db.collection('profiles').get();
for (let i = 0; i < snap.docs.length; i += 200) {
  const batch = db.batch();
  for (const d of snap.docs.slice(i, i + 200)) {
    batch.set(db.collection('admissionProfiles').doc(d.id), d.data());
    if (deleteOld) batch.delete(d.ref);
  }
  await batch.commit();
}
console.log(`Copied ${snap.size} profiles to admissionProfiles${deleteOld ? ' and deleted the originals' : ''}.`);
