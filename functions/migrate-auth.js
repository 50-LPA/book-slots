#!/usr/bin/env node
// One-time migration: Firestore plaintext passwords -> Firebase Auth.
//
//   cd functions && npm install
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json   (keep OUT of the repo)
//   node migrate-auth.js            # dry run: prints the plan, changes nothing
//   node migrate-auth.js --create   # phase 1: create Auth users (uid = Firestore doc id). Old site keeps working.
//   node migrate-auth.js --purge    # phase 2 (after new site is live): delete plaintext `password` fields
//   node migrate-auth.js --self-test
//
// Passwords shorter than 6 chars (Firebase minimum) are stored as password + LEGACY_PW_SUFFIX;
// the login page appends the same suffix, so those users notice nothing. Empty passwords get a
// random temporary one, printed once.
const crypto = require('crypto');
const fs = require('fs');

// Must match mobileToAuthEmail() in src/firebase/firebase.js and emailFor() in index.js.
const emailFor = (mobile, projectId) => `${mobile}@${projectId}.firebaseapp.com`;
// Must match LEGACY_PW_SUFFIX in src/firebase/firebase.js.
const LEGACY_PW_SUFFIX = '#slots-legacy';

function normalizeMobile(raw) {
  let m = String(raw ?? '').replace(/\D/g, '');
  if (m.length === 12 && m.startsWith('91')) m = m.slice(2);
  return /^\d{10}$/.test(m) ? m : null;
}

// Pure: decide what to do with each account. rows: [{ col, id, mobileRaw, password }]
function plan(rows, randomPassword = () => String(crypto.randomInt(100000, 1000000))) {
  const seen = new Map();
  return rows.map((r) => {
    const mobile = normalizeMobile(r.mobileRaw);
    if (!mobile) return { ...r, action: 'skip', reason: `invalid mobile "${r.mobileRaw ?? ''}"` };
    if (seen.has(mobile)) return { ...r, mobile, action: 'skip', reason: `mobile already used by ${seen.get(mobile)}` };
    seen.set(mobile, `${r.col}/${r.id}`);
    const pw = String(r.password ?? '').trim();
    if (!pw) return { ...r, mobile, action: 'create', password: randomPassword(), temp: true };
    return { ...r, mobile, action: 'create', password: pw.length < 6 ? pw + LEGACY_PW_SUFFIX : pw, temp: false };
  });
}

function selfTest() {
  const assert = require('assert');
  const out = plan(
    [
      { col: 'admin', id: 'a1', mobileRaw: '99999 99999', password: '9999' },
      { col: 'candidates', id: 'c1', mobileRaw: '+91 9876543210', password: '123456' },
      { col: 'candidates', id: 'c2', mobileRaw: '9876543210', password: '654321' },
      { col: 'candidates', id: 'c3', mobileRaw: '12', password: '123456' },
      { col: 'candidates', id: 'c4', mobileRaw: '9000000000', password: '' },
    ],
    () => 'TEMP00',
  );
  assert.deepStrictEqual(out.map((o) => o.action), ['create', 'create', 'skip', 'skip', 'create']);
  assert.strictEqual(out[0].mobile, '9999999999');
  assert.strictEqual(out[0].password, '9999#slots-legacy');
  assert.strictEqual(out[0].temp, false);
  assert.strictEqual(out[4].password, 'TEMP00');
  assert.strictEqual(out[4].temp, true);
  assert.strictEqual(out[1].mobile, '9876543210');
  assert.strictEqual(out[1].password, '123456');
  assert.match(out[2].reason, /candidates\/c1/);
  console.log('self-test ok');
}

async function main() {
  const mode = process.argv[2] || '--dry-run';
  if (mode === '--self-test') return selfTest();

  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON path.');
  const projectId = JSON.parse(fs.readFileSync(keyPath, 'utf8')).project_id;
  initializeApp({ credential: applicationDefault(), projectId });
  const auth = getAuth();
  const db = getFirestore();

  const rows = [];
  for (const d of (await db.collection('admin').get()).docs) {
    rows.push({ col: 'admin', id: d.id, field: 'phone', mobileRaw: d.get('phone'), password: d.get('password') });
  }
  for (const d of (await db.collection('candidates').get()).docs) {
    rows.push({ col: 'candidates', id: d.id, field: 'mobile', mobileRaw: d.get('mobile'), password: d.get('password') });
  }

  if (mode === '--purge') {
    let purged = 0;
    for (const r of rows) {
      if (r.password === undefined) continue;
      const hasLogin = await auth.getUser(r.id).then(() => true, () => false);
      if (!hasLogin) {
        console.log(`KEEP   ${r.col}/${r.id}: no Auth user yet (run --create first)`);
        continue;
      }
      await db.doc(`${r.col}/${r.id}`).update({ password: FieldValue.delete() });
      purged++;
    }
    console.log(`Purged plaintext password from ${purged} docs.`);
    return;
  }

  const apply = mode === '--create';
  const temps = [];
  for (const p of plan(rows)) {
    const tag = `${p.col}/${p.id}`;
    if (p.action === 'skip') {
      console.log(`SKIP   ${tag}: ${p.reason}`);
      continue;
    }
    const exists = await auth.getUser(p.id).then(() => true, () => false);
    if (exists) {
      console.log(`EXISTS ${tag}`);
      continue;
    }
    if (!apply) {
      console.log(`WOULD  ${tag} -> ${p.mobile}${p.temp ? ' (temp password)' : ''}`);
      continue;
    }
    try {
      await auth.createUser({ uid: p.id, email: emailFor(p.mobile, projectId), password: p.password });
      // Rules match candidates by exact mobile string, so store it normalized.
      if (String(p.mobileRaw) !== p.mobile) await db.doc(tag).update({ [p.field]: p.mobile });
      console.log(`OK     ${tag} -> ${p.mobile}`);
      if (p.temp) temps.push(`${p.col.padEnd(10)} ${p.mobile}  ${p.password}`);
    } catch (e) {
      console.log(`FAIL   ${tag}: ${e.code || e.message}`);
    }
  }
  if (temps.length) {
    console.log('\nTemporary passwords (these accounts had none). Share privately, then clear your terminal:');
    temps.forEach((t) => console.log('  ' + t));
  }
  if (!apply) console.log('\nDry run only. Re-run with --create to apply.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
