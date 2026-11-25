// One-off: encrypt the plain-text password copies in candidateSecrets (same key as the admin-auth function).
// Run: FIREBASE_CLIENT_EMAIL=… FIREBASE_PRIVATE_KEY=… PASSWORD_KEY=… REACT_APP_FIREBASE_PROJECT_ID=… node scripts/encrypt-candidate-secrets.mjs
// Cost: 1 read per secret + 1 write per plain one. Safe to re-run: encrypted ones are skipped.
import assert from 'node:assert/strict';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { encrypt, decrypt } from '../netlify/functions/admin-auth.mjs';

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

const plain = (await db.collection('candidateSecrets').get()).docs.filter((d) => !d.data().cipher && d.data().password);
for (let i = 0; i < plain.length; i += 200) {
  const batch = db.batch();
  for (const d of plain.slice(i, i + 200)) {
    const password = String(d.data().password);
    const cipher = encrypt(password);
    assert.equal(decrypt(cipher), password); // never replace a password with something that can't be read back
    batch.set(d.ref, { cipher, updatedAt: d.data().updatedAt ?? Date.now() }); // no merge: drops the plain copy
  }
  await batch.commit();
}
console.log(`Encrypted ${plain.length} password copies.`);
