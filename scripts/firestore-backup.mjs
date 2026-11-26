// Full Firestore backup / restore as one JSON file (Spark plan: no managed export, so this uses the Admin SDK).
// Backup:  netlify dev:exec node scripts/firestore-backup.mjs backup            -> backups/firestore-<timestamp>.json
// Restore: netlify dev:exec node scripts/firestore-backup.mjs restore <file> --yes
// (netlify dev:exec injects FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY / REACT_APP_FIREBASE_PROJECT_ID from the site env.)
// Cost: backup = 1 read per document; restore = 1 write per document. Restore overwrites each backed-up document
// exactly (set, not merge) and leaves documents that aren't in the file untouched.
// ponytail: root collections only (the app has no subcollections); add doc.ref.listCollections() recursion if one appears.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint, DocumentReference } from 'firebase-admin/firestore';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
if (!projectId || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
  console.error('Missing REACT_APP_FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}
initializeApp({
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
  projectId,
});
const db = getFirestore();

// Firestore types that JSON can't hold are stored as { __type, ... } so restore brings back the same type.
const encode = (v) => {
  if (v instanceof Timestamp) return { __type: 'timestamp', seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (v instanceof GeoPoint) return { __type: 'geopoint', latitude: v.latitude, longitude: v.longitude };
  if (v instanceof DocumentReference) return { __type: 'ref', path: v.path };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __type: 'bytes', base64: Buffer.from(v).toString('base64') };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
};
const decode = (v) => {
  if (Array.isArray(v)) return v.map(decode);
  if (!v || typeof v !== 'object') return v;
  switch (v.__type) {
    case 'timestamp': return new Timestamp(v.seconds, v.nanoseconds);
    case 'geopoint': return new GeoPoint(v.latitude, v.longitude);
    case 'ref': return db.doc(v.path);
    case 'bytes': return Buffer.from(v.base64, 'base64');
    default: return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
};

const [cmd, file] = process.argv.slice(2);

if (cmd === 'backup') {
  const documents = {};
  for (const col of await db.listCollections()) {
    const snap = await col.get();
    for (const d of snap.docs) documents[d.ref.path] = encode(d.data());
    console.log(`${col.id}: ${snap.size}`);
  }
  mkdirSync('backups', { recursive: true });
  const out = `backups/firestore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(out, JSON.stringify({ projectId, exportedAt: new Date().toISOString(), documents }, null, 1));
  console.log(`Saved ${Object.keys(documents).length} documents to ${out}`);
} else if (cmd === 'restore' && file) {
  const { projectId: from, documents } = JSON.parse(readFileSync(file, 'utf8'));
  const paths = Object.keys(documents);
  if (!process.argv.includes('--yes')) {
    console.error(`Would overwrite ${paths.length} documents in project "${projectId}" (backup from "${from}"). Re-run with --yes.`);
    process.exit(1);
  }
  const writer = db.bulkWriter();
  let failed = 0;
  writer.onWriteError((e) => { if (e.failedAttempts < 5) return true; failed++; console.error(e.documentRef.path, e.message); return false; });
  for (const p of paths) writer.set(db.doc(p), decode(documents[p]));
  await writer.close();
  console.log(`Restored ${paths.length - failed}/${paths.length} documents to "${projectId}".`);
  process.exit(failed ? 1 : 0);
} else {
  console.error('Usage: node scripts/firestore-backup.mjs backup | restore <file> --yes');
  process.exit(1);
}
