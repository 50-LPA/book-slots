// One admin only: keeps the admin/{uid} doc named "Viraj Kadam" and removes every other admin (its admin doc and
// its Firebase Auth login). Dry run (lists what it would do) unless --write. Refuses unless exactly one admin has that name.
// Run: FIREBASE_CLIENT_EMAIL=… FIREBASE_PRIVATE_KEY=… REACT_APP_FIREBASE_PROJECT_ID=… node scripts/keep-one-admin.mjs [--write]
// Cost: 1 read per admin doc (+1 per removed admin, to keep logins that are also candidates) + 1 delete per removed admin. New admins can't be added from the app (firestore.rules).
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const KEEP = 'viraj kadam';
const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
initializeApp({
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
  projectId,
});
const write = process.argv.includes('--write');
const db = getFirestore();

const admins = (await db.collection('admin').get()).docs;
const name = (d) => String(d.data().name || '').trim().replace(/\s+/g, ' ');
const keep = admins.filter((d) => name(d).toLowerCase() === KEEP);
console.log(`${admins.length} admin(s):`);
admins.forEach((d) => console.log(`  ${keep.includes(d) ? 'KEEP  ' : 'REMOVE'} ${d.id}  ${name(d) || '(no name)'}  ${d.data().mobile || ''}`));
if (keep.length !== 1) {
  console.error(`\nExpected exactly one admin named "Viraj Kadam", found ${keep.length}. Nothing changed.`);
  process.exit(1);
}

const remove = admins.filter((d) => d !== keep[0]);
if (!write) {
  console.log(`\nDry run: ${remove.length} admin(s) would be removed. Re-run with --write to remove them.`);
  process.exit(0);
}
for (const d of remove) {
  // Same uid = same mobile login: if it is also a candidate, only the admin rights go, the login stays.
  const alsoCandidate = (await db.doc(`candidates/${d.id}`).get()).exists;
  if (!alsoCandidate) {
    await getAuth().deleteUser(d.id).catch((e) => {
      if (e.code !== 'auth/user-not-found') throw e; // doc without a login: just drop the doc
    });
  }
  await d.ref.delete();
  console.log(`Removed ${d.id} ${name(d)}`);
}
console.log(`\nDone: ${remove.length} removed; ${keep[0].id} (${name(keep[0])}) is the only admin.`);
