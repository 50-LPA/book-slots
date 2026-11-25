// HR writes (create: admins and candidates; update/delete: admins), plus the HR index they keep current.
// hrIndex/all holds every HR as one JSON string, so the candidate dashboard reads 1 doc instead of the whole
// hrs collection (467 docs, once per login). Writing an HR and the index in one transaction keeps them in step,
// so clients may not write either directly (firestore.rules). Env: as admin-auth.mjs.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { JOB_TYPES, findHrDuplicates, normMobile, validateHr } from '../../src/utils/hrValidation.mjs';

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
const init = () => getApps().length || initializeApp({
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
});

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// ponytail: one doc caps at 1 MB: ~4000 HRs at ~250 bytes each (467 = 115 KB). Shard by first letter if it gets close.
const indexRef = () => getFirestore().doc('hrIndex/all');
const millis = (t) => (t?.toMillis ? t.toMillis() : typeof t === 'number' ? t : t ? Date.parse(t) || null : null);
// What the dashboards need of an HR (the hrs doc keeps everything).
export const toItem = (id, d) => ({
  id,
  name: d.name || '',
  email: d.email || '',
  mobile: d.mobile || '',
  company: d.company || '',
  technology: d.technology || '',
  jobType: d.jobType || '',
  addedBy: d.addedBy || d.addedByName || d.createdBy || '',
  addedById: d.addedById || d.createdById || d.createdByUid || null,
  createdAt: millis(d.createdAt),
});
const indexData = (items) => ({ json: JSON.stringify(items), count: items.length, updatedAt: FieldValue.serverTimestamp() });

// Index entries, newest first. Missing index: built from the hrs collection (self-heals; one full read).
async function readIndex(tx) {
  const snap = await tx.get(indexRef());
  if (snap.exists) return JSON.parse(snap.data().json || '[]');
  const all = await tx.get(getFirestore().collection('hrs'));
  return all.docs.map((d) => toItem(d.id, d.data())).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
export async function rebuildIndex() {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const all = await tx.get(db.collection('hrs'));
    const items = all.docs.map((d) => toItem(d.id, d.data())).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    tx.set(indexRef(), indexData(items));
    return items.length;
  });
}

// Only the form fields, trimmed; validated with the same rules as the pop-up.
function cleanHr(raw = {}) {
  const hr = {
    name: String(raw.name ?? '').trim(),
    email: String(raw.email ?? '').trim(),
    mobile: normMobile(raw.mobile),
    company: String(raw.company ?? '').trim(),
    technology: String(raw.technology ?? '').trim(),
    jobType: String(raw.jobType ?? '').trim().toLowerCase(),
  };
  const fieldErrors = validateHr(hr);
  if (hr.jobType && !JOB_TYPES.includes(hr.jobType)) fieldErrors.jobType = 'Pick a job type from the list.';
  if (Object.keys(fieldErrors).length) throw new HttpError(400, 'Check the highlighted fields.', { fieldErrors });
  return hr;
}
const noDuplicates = (items, hr, exceptId) => {
  const { errors, byEmail, byMobile } = findHrDuplicates(items, hr, exceptId);
  if (Object.keys(errors).length) throw new HttpError(409, 'This HR is already saved.', { fieldErrors: errors, existingHrForEmail: byEmail, existingHrForMobile: byMobile });
};

async function create(user, data) {
  const hr = cleanHr(data.hr);
  const db = getFirestore();
  const ref = db.collection('hrs').doc();
  const meta = { addedBy: user.name, addedById: user.addedById };
  const item = toItem(ref.id, { ...hr, ...meta, createdAt: Date.now() });
  await db.runTransaction(async (tx) => {
    const items = await readIndex(tx);
    noDuplicates(items, hr);
    tx.set(ref, { ...hr, ...meta, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.set(indexRef(), indexData([item, ...items]));
  });
  return { hr: item };
}

async function update(user, data) {
  if (!user.admin) throw new HttpError(403, 'Admins only.');
  const id = String(data.id || '');
  if (!id) throw new HttpError(400, 'id is required.');
  const hr = cleanHr(data.hr);
  const db = getFirestore();
  let item;
  await db.runTransaction(async (tx) => {
    const items = await readIndex(tx);
    const current = await tx.get(db.doc(`hrs/${id}`));
    if (!current.exists) throw new HttpError(404, 'This HR was not found.');
    noDuplicates(items, hr, id);
    item = toItem(id, { ...current.data(), ...hr });
    tx.update(current.ref, { ...hr, updatedAt: FieldValue.serverTimestamp() });
    tx.set(indexRef(), indexData(items.some((h) => h.id === id) ? items.map((h) => (h.id === id ? item : h)) : [item, ...items]));
  });
  return { hr: item };
}

async function remove(user, data) {
  if (!user.admin) throw new HttpError(403, 'Admins only.');
  const id = String(data.id || '');
  if (!id) throw new HttpError(400, 'id is required.');
  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const items = await readIndex(tx);
    tx.delete(db.doc(`hrs/${id}`));
    tx.set(indexRef(), indexData(items.filter((h) => h.id !== id)));
  });
  return { ok: true };
}

// Who is asking: an admin (admin/{uid}) or a candidate (candidates/{uid}). "Added By" comes from their record,
// not from the request.
async function caller(uid, email) {
  const db = getFirestore();
  const admin = await db.doc(`admin/${uid}`).get();
  if (admin.exists) {
    const a = admin.data();
    return { admin: true, name: String(a.name || '').trim() || 'Admin', addedById: normMobile(a.mobile) || null };
  }
  const cand = await db.doc(`candidates/${uid}`).get();
  if (!cand.exists) throw new HttpError(403, 'Sign in again.');
  const c = cand.data();
  const mobile = normMobile(c.mobile) || normMobile(String(email || '').split('@')[0]);
  return { admin: false, name: String(c.name || '').trim() || 'Candidate', addedById: mobile || uid };
}

const actions = { create, update, delete: remove };

export default async (req) => {
  try {
    init();
    if (req.method !== 'POST') throw new HttpError(405, 'POST only.');
    const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (!token) throw new HttpError(401, 'Sign in first.');
    const { uid, email } = await getAuth().verifyIdToken(token).catch(() => {
      throw new HttpError(401, 'Sign in again.');
    });
    const { action, ...data } = await req.json().catch(() => ({}));
    const fn = actions[action];
    if (!fn) throw new HttpError(400, 'Unknown action.');
    return Response.json(await fn(await caller(uid, email), data));
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return Response.json(
      { error: e instanceof HttpError ? e.message : 'Server error.', ...(e instanceof HttpError ? e.extra : {}) },
      { status: e.status || 500 },
    );
  }
};
