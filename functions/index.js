// Admin-only account management. Client SDKs cannot set another user's password,
// so these run server-side with the Admin SDK.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

const REGION = 'asia-south1'; // must match getFunctions(app, ...) in src/firebase/firebase.js

// Must match mobileToAuthEmail() in src/firebase/firebase.js.
const emailFor = (mobile) => `${mobile}@${process.env.GCLOUD_PROJECT}.firebaseapp.com`;

async function assertAdmin(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const snap = await getFirestore().doc(`admin/${req.auth.uid}`).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Admins only.');
}

function cleanMobile(raw) {
  const mobile = String(raw ?? '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(mobile)) throw new HttpsError('invalid-argument', 'Enter a valid 10-digit mobile number.');
  return mobile;
}

function cleanPassword(raw) {
  const password = String(raw ?? '').trim();
  if (password.length < 6) throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  return password;
}

// Create (no uid) or update (uid) a candidate's login. Returns { uid }.
exports.adminSetCandidateAuth = onCall({ region: REGION }, async (req) => {
  await assertAdmin(req);
  const { uid } = req.data || {};
  const email = emailFor(cleanMobile(req.data?.mobile));
  const password = req.data?.password ? cleanPassword(req.data.password) : undefined;
  const auth = getAuth();
  if (uid && (await getFirestore().doc(`admin/${uid}`).get()).exists) {
    throw new HttpsError('permission-denied', 'Admin logins are managed in the Firebase Console.');
  }

  try {
    if (!uid) {
      if (!password) throw new HttpsError('invalid-argument', 'Password is required.');
      const user = await auth.createUser({ email, password });
      return { uid: user.uid };
    }
    try {
      await auth.updateUser(uid, { email, ...(password && { password }) });
    } catch (e) {
      // Candidate created before the Auth migration: create their login with the same uid.
      if (e.code !== 'auth/user-not-found') throw e;
      if (!password) throw new HttpsError('failed-precondition', 'This candidate has no login yet. Set a password.');
      await auth.createUser({ uid, email, password });
    }
    return { uid };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'This mobile number is already registered.');
    }
    throw new HttpsError('internal', e.message);
  }
});

exports.adminDeleteCandidateAuth = onCall({ region: REGION }, async (req) => {
  await assertAdmin(req);
  const uid = String(req.data?.uid || '');
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');
  if ((await getFirestore().doc(`admin/${uid}`).get()).exists) {
    throw new HttpsError('permission-denied', 'Cannot delete an admin account here.');
  }
  await getAuth().deleteUser(uid).catch((e) => {
    if (e.code !== 'auth/user-not-found') throw e;
  });
  return { ok: true };
});
