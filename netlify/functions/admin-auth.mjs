// Admin-only candidate login management (Firebase Cloud Functions replacement — no billing needed).
// Client SDKs cannot set another user's password, so this runs server-side with the Admin SDK.
// Env (Netlify → Site configuration → Environment variables, scope: Functions):
//   FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY  (from a service-account key JSON)
//   REACT_APP_FIREBASE_PROJECT_ID
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
  const auth = getAuth();
  if (uid && (await isAdmin(uid))) throw new HttpError(403, 'Admin logins are managed in the Firebase Console.');

  try {
    if (!uid) {
      if (!password) throw new HttpError(400, 'Password is required.');
      return { uid: (await auth.createUser({ email, password })).uid };
    }
    try {
      await auth.updateUser(uid, { email, ...(password && { password }) });
    } catch (e) {
      // Candidate created before the Auth migration: create their login with the same uid.
      if (e.code !== 'auth/user-not-found') throw e;
      if (!password) throw new HttpError(400, 'This candidate has no login yet. Set a password.');
      await auth.createUser({ uid, email, password });
    }
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
  return { ok: true };
}

const actions = { set: setCandidateAuth, delete: deleteCandidateAuth };

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
