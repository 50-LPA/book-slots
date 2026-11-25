// Admin-only candidate login management (Firebase Cloud Functions replacement — no billing needed).
// Client SDKs cannot set another user's password, so this runs server-side with the Admin SDK.
// Env (Netlify → Site configuration → Environment variables, scope: Functions):
//   FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY  (from a service-account key JSON)
//   REACT_APP_FIREBASE_PROJECT_ID
//   PASSWORD_KEY  (any long random string; encrypts the admin's readable password copy. Losing it loses the copies, not the logins.)
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
const init = () => getApps().length || initializeApp({
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
    }),
  });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Must match mobileToAuthEmail() in src/firebase/firebase.js.
const emailFor = (mobile) => `${mobile}@${projectId}.firebaseapp.com`;
const isAdmin = async (uid) => (await getFirestore().doc(`admin/${uid}`).get()).exists;
// Encrypted copy so admins can look up a candidate's password (Auth only keeps a hash). Only this function reads it
// (firestore.rules deny all client access), and only the function holds the key.
const secretRef = (uid) => getFirestore().doc(`candidateSecrets/${uid}`);
const key = () => {
  if (!process.env.PASSWORD_KEY) throw new Error('PASSWORD_KEY is not set.');
  return createHash('sha256').update(process.env.PASSWORD_KEY).digest();
};
// AES-256-GCM, stored as "iv.tag.data" (base64).
export function encrypt(text) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
export function decrypt(stored) {
  const [iv, tag, data] = stored.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}
const savePassword = (uid, password) => password && secretRef(uid).set({ cipher: encrypt(password), updatedAt: Date.now() });

function cleanMobile(raw) {
  const mobile = String(raw ?? '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(mobile)) throw new HttpError(400, 'Enter a valid 10-digit mobile number.');
  return mobile;
}

function cleanPassword(raw) {
  const password = String(raw ?? '').trim();
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  return password;
}

// Create (no uid) or update (uid) a candidate's login. Returns { uid }.
async function setCandidateAuth(data) {
  const uid = data.uid ? String(data.uid) : '';
  const email = emailFor(cleanMobile(data.mobile));
  const password = data.password ? cleanPassword(data.password) : undefined;
  if (password) key(); // missing key: fail before the login changes, not after
  const auth = getAuth();
  if (uid && (await isAdmin(uid))) throw new HttpError(403, 'Admin logins are managed in the Firebase Console.');

  try {
    if (!uid) {
      if (!password) throw new HttpError(400, 'Password is required.');
      const created = await auth.createUser({ email, password });
      await savePassword(created.uid, password);
      return { uid: created.uid };
    }
    try {
      await auth.updateUser(uid, { email, ...(password && { password }) });
    } catch (e) {
      // Candidate created before the Auth migration: create their login with the same uid.
      if (e.code !== 'auth/user-not-found') throw e;
      if (!password) throw new HttpError(400, 'This candidate has no login yet. Set a password.');
      await auth.createUser({ uid, email, password });
    }
    await savePassword(uid, password);
    return { uid };
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw new HttpError(409, 'This mobile number is already registered.');
    throw e;
  }
}

async function deleteCandidateAuth(data) {
  const uid = String(data.uid || '');
  if (!uid) throw new HttpError(400, 'uid is required.');
  if (await isAdmin(uid)) throw new HttpError(403, 'Cannot delete an admin account here.');
  await getAuth().deleteUser(uid).catch((e) => {
    if (e.code !== 'auth/user-not-found') throw e;
  });
  await secretRef(uid).delete();
  return { ok: true };
}

// A candidate's current password, '' when none was saved (logins older than the copy: set a new one).
async function getCandidatePassword(data) {
  const uid = String(data.uid || '');
  if (!uid) throw new HttpError(400, 'uid is required.');
  const snap = await secretRef(uid).get();
  const d = snap.exists ? snap.data() : {};
  return { password: d.cipher ? decrypt(d.cipher) : String(d.password || '') }; // password: plain copy not yet encrypted
}

const actions = { set: setCandidateAuth, delete: deleteCandidateAuth, get: getCandidatePassword };

export default async (req) => {
  try {
    init();
    if (req.method !== 'POST') throw new HttpError(405, 'POST only.');
    const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (!token) throw new HttpError(401, 'Sign in first.');
    const { uid } = await getAuth().verifyIdToken(token).catch(() => {
      throw new HttpError(401, 'Sign in again.');
    });
    if (!(await isAdmin(uid))) throw new HttpError(403, 'Admins only.');

    const { action, ...data } = await req.json().catch(() => ({}));
    const fn = actions[action];
    if (!fn) throw new HttpError(400, 'Unknown action.');
    return Response.json(await fn(data));
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return Response.json({ error: e instanceof HttpError ? e.message : 'Server error.' }, { status: e.status || 500 });
  }
};
